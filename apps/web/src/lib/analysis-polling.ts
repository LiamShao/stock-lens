import type {
  AnalysisPageResponse,
  AnalysisResource,
  AnalysisStatus,
} from '@stocklens/shared';

export const ANALYSIS_STATUS_POLL_INTERVAL_MS = 5_000;
export const MAX_ANALYSIS_STATUS_POLL_DURATION_MS = 5 * 60_000;

const POLLABLE_STATUSES = new Set<AnalysisStatus>([
  'PARSING',
  'CHUNKING',
  'READY_FOR_EMBEDDING',
  'EMBEDDING',
  'EXTRACTING',
  'VALIDATING',
  'READY_FOR_VIEW_GENERATION',
]);

export function getAnalysisPollingInterval(
  analysis: AnalysisResource | undefined,
  pollingStartedAt: number | null,
  now = Date.now(),
): number | false {
  return analysis &&
    shouldContinuePolling(analysis.status, pollingStartedAt, now)
    ? ANALYSIS_STATUS_POLL_INTERVAL_MS
    : false;
}

export function getHistoryPollingInterval(
  page: AnalysisPageResponse | undefined,
  pollingStartedAt: number | null,
  now = Date.now(),
): number | false {
  return page?.items.some(({ status }) =>
    shouldContinuePolling(status, pollingStartedAt, now),
  )
    ? ANALYSIS_STATUS_POLL_INTERVAL_MS
    : false;
}

export function isFailedAnalysisStatus(status: AnalysisStatus): boolean {
  return status.startsWith('FAILED_');
}

function shouldContinuePolling(
  status: AnalysisStatus,
  pollingStartedAt: number | null,
  now: number,
): boolean {
  return (
    pollingStartedAt !== null &&
    POLLABLE_STATUSES.has(status) &&
    now - pollingStartedAt < MAX_ANALYSIS_STATUS_POLL_DURATION_MS
  );
}
