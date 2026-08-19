import type { Job, Queue } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import type { Readable } from 'node:stream';
import type { ObjectStorage } from '@stocklens/object-storage';
import { MAX_PDF_SIZE_BYTES } from '@stocklens/object-storage';
import {
  ANALYSIS_CHUNK_JOB_NAME,
  ANALYSIS_CALCULATE_METRICS_JOB_NAME,
  ANALYSIS_JOB_BACKOFF_DELAY_MS,
  ANALYSIS_JOB_MAX_ATTEMPTS,
  ANALYSIS_PARSE_JOB_NAME,
  analysisJobDataSchema,
  type AnalysisJobData,
} from '@stocklens/shared';

import type {
  AnalysisProcessingJobRepository,
  ProcessingAttemptInput,
} from './analysis-processing.repository';
import { NonRetryablePdfError, extractPdfPages } from './pdf-text-extractor';
import { chunkPages } from './page-chunker';

export class AnalysisProcessingProcessor {
  constructor(
    private readonly repository: AnalysisProcessingJobRepository,
    private readonly storage: ObjectStorage,
    private readonly bucket: string,
    private readonly queue: Pick<Queue<AnalysisJobData>, 'add'>,
  ) {}

  async process(job: Job<AnalysisJobData>): Promise<void> {
    if (
      job.id === undefined ||
      ![ANALYSIS_PARSE_JOB_NAME, ANALYSIS_CHUNK_JOB_NAME].includes(job.name)
    )
      throw new UnrecoverableError('Analysis job envelope is invalid.');
    const data = analysisJobDataSchema.parse(job.data);
    const attempt: ProcessingAttemptInput = {
      attempt: job.attemptsMade + 1,
      bullmqJobId: job.id,
      jobExecutionId: data.jobExecutionId,
    };
    const claim = await this.repository.begin(attempt);
    if (claim.alreadySucceeded) return;
    const effectiveAttempt = { ...attempt, attempt: claim.attempt };
    try {
      if (job.name === ANALYSIS_PARSE_JOB_NAME) {
        const results = [];
        for (const document of claim.documents) {
          if (document.storageBucket !== this.bucket)
            throw new NonRetryablePdfError(
              'PDF_STORAGE_MISMATCH',
              'PDF storage target is invalid.',
            );
          const bytes = await readPdfStreamBounded(
            await this.storage.getObjectStream(document.storageKey),
          );
          results.push({
            documentId: document.id,
            pages: await withTimeout(extractPdfPages(bytes), 120_000),
          });
        }
        const chunkExecutionId = await this.repository.finishParse(
          effectiveAttempt,
          claim.ownerId,
          claim.analysisId,
          results,
        );
        try {
          await this.queue.add(
            ANALYSIS_CHUNK_JOB_NAME,
            { jobExecutionId: chunkExecutionId },
            {
              attempts: ANALYSIS_JOB_MAX_ATTEMPTS,
              backoff: {
                delay: ANALYSIS_JOB_BACKOFF_DELAY_MS,
                type: 'exponential',
              },
              jobId: chunkExecutionId,
              removeOnComplete: true,
              removeOnFail: false,
            },
          );
        } catch {
          // The durable QUEUED chunk execution is recovered by the scanner.
        }
      } else {
        const pages = await this.repository.loadPages(
          claim.ownerId,
          claim.analysisId,
        );
        const generated = chunkPages(pages);
        if (generated.length === 0)
          throw new NonRetryablePdfError(
            'PDF_HAS_NO_TEXT',
            'PDF contains no extractable text.',
          );
        const documentIndexes = new Map<string, number>();
        const chunks = generated.map((chunk) => {
          const page = pages.find(({ id }) => id === chunk.pageId);
          if (!page) throw new Error('Chunk page is unavailable.');
          const chunkIndex = documentIndexes.get(page.documentId) ?? 0;
          documentIndexes.set(page.documentId, chunkIndex + 1);
          return { ...chunk, chunkIndex, documentId: page.documentId };
        });
        const metricExecutionId = await this.repository.finishChunk(
          effectiveAttempt,
          claim.ownerId,
          claim.analysisId,
          chunks,
        );
        try {
          await this.queue.add(
            ANALYSIS_CALCULATE_METRICS_JOB_NAME,
            { jobExecutionId: metricExecutionId },
            analysisJobOptions(metricExecutionId),
          );
        } catch {
          // The durable QUEUED metrics execution is recovered by the scanner.
        }
      }
    } catch (error) {
      const code =
        error instanceof NonRetryablePdfError
          ? error.code
          : 'PROCESSING_DEPENDENCY_FAILED';
      await this.repository.fail(effectiveAttempt, claim.step, code);
      if (error instanceof NonRetryablePdfError)
        throw new UnrecoverableError(error.message);
      throw new Error('Analysis processing failed.');
    }
  }
}

function analysisJobOptions(jobExecutionId: string) {
  return {
    attempts: ANALYSIS_JOB_MAX_ATTEMPTS,
    backoff: {
      delay: ANALYSIS_JOB_BACKOFF_DELAY_MS,
      type: 'exponential' as const,
    },
    jobId: jobExecutionId,
    removeOnComplete: true,
    removeOnFail: false,
  };
}

export async function readPdfStreamBounded(
  stream: Readable,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const raw of stream) {
    const chunk = toBuffer(raw);
    size += chunk.length;
    if (size > MAX_PDF_SIZE_BYTES) {
      stream.destroy();
      throw new NonRetryablePdfError(
        'PDF_SIZE_LIMIT_EXCEEDED',
        'PDF size limit exceeded.',
      );
    }
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function toBuffer(raw: unknown): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (typeof raw === 'string' || raw instanceof Uint8Array)
    return Buffer.from(raw);
  throw new NonRetryablePdfError(
    'PDF_STREAM_INVALID',
    'PDF stream is invalid.',
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new NonRetryablePdfError(
                'PDF_PARSE_TIMEOUT',
                'PDF parsing timed out.',
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
