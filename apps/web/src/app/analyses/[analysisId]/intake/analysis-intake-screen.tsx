'use client';

import type { AnalysisResource, DocumentType } from '@stocklens/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import { ProtectedShell } from '@/components/protected-shell';
import { SessionLoading } from '@/components/session-loading';
import { toUserFacingErrorMessage } from '@/lib/api-client';
import {
  PdfUploadError,
  uploadPdfFile,
  validatePdfFile,
  validatePdfSelectionCount,
  type PdfUploadStep,
} from '@/lib/pdf-upload';
import { formatDateTime } from '@/lib/presentation';
import { useRequireSession } from '@/session/use-require-session';

type LocalUploadStatus = 'ready' | PdfUploadStep | 'failed';

interface LocalUpload {
  documentType: DocumentType;
  error: string | null;
  file: File;
  id: string;
  status: LocalUploadStatus;
}

const DOCUMENT_TYPE_OPTIONS: ReadonlyArray<{
  label: string;
  value: DocumentType;
}> = [
  { label: '種類を指定しない', value: 'UNKNOWN' },
  { label: '決算短信', value: 'EARNINGS_SUMMARY' },
  { label: '決算説明資料', value: 'EARNINGS_PRESENTATION' },
  { label: '有価証券報告書', value: 'ANNUAL_SECURITIES_REPORT' },
  { label: 'その他', value: 'OTHER' },
];

const STATUS_LABELS: Record<LocalUploadStatus, string> = {
  failed: '失敗',
  finalizing: 'サーバーでPDFを検証中',
  hashing: 'ファイルを確認中',
  ready: 'アップロード待ち',
  starting: '安全なアップロードを準備中',
  uploading: 'アップロード中',
};

export function AnalysisIntakeScreen({ analysisId }: { analysisId: string }) {
  const session = useRequireSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const [localUploads, setLocalUploads] = useState<LocalUpload[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  const analysis = useQuery({
    enabled: session.status === 'authenticated',
    queryFn: ({ signal }) => session.apiClient.getAnalysis(analysisId, signal),
    queryKey: ['analysis', analysisId],
  });
  const documents = useQuery({
    enabled:
      session.status === 'authenticated' &&
      (analysis.data?.status === 'DRAFT' ||
        analysis.data?.status === 'UPLOADED'),
    queryFn: ({ signal }) =>
      session.apiClient.listDocuments(analysisId, signal),
    queryKey: ['documents', analysisId],
  });
  const deleteDocument = useMutation({
    mutationFn: (documentId: string) =>
      session.apiClient.deleteDocument(analysisId, documentId),
    onSuccess: async () => {
      await documents.refetch();
      await analysis.refetch();
    },
  });
  const process = useMutation({
    mutationFn: () => session.apiClient.processAnalysis(analysisId),
    onSuccess: (accepted) => {
      queryClient.setQueryData<AnalysisResource>(
        ['analysis', analysisId],
        (current) =>
          current === undefined
            ? current
            : { ...current, status: accepted.status },
      );
      void queryClient.invalidateQueries({ queryKey: ['analyses'] });
      router.replace(`/analyses/${analysisId}`);
    },
  });
  const deleteAnalysis = useMutation({
    mutationFn: () => session.apiClient.deleteAnalysis(analysisId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['analyses'] });
      router.replace('/analyses');
    },
  });

  useEffect(() => {
    const activeControllers = controllers.current;
    return () => {
      for (const controller of activeControllers.values()) controller.abort();
      activeControllers.clear();
    };
  }, []);

  useEffect(() => {
    const status = analysis.data?.status;
    if (status && status !== 'DRAFT' && status !== 'UPLOADED') {
      router.replace(`/analyses/${analysisId}`);
    }
  }, [analysis.data?.status, analysisId, router]);

  if (session.status !== 'authenticated') return <SessionLoading />;

  const finalizedDocuments = documents.data?.items ?? [];
  const isUploading = localUploads.some((item) =>
    ['hashing', 'starting', 'uploading', 'finalizing'].includes(item.status),
  );
  const availableSlots = 3 - finalizedDocuments.length - localUploads.length;
  const uploadable = localUploads.filter(
    (item) => item.status === 'ready' || item.status === 'failed',
  );

  const selectFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    setSelectionError(null);
    try {
      validatePdfSelectionCount(files.length);
      if (files.length > availableSlots) {
        throw new PdfUploadError('PDF_FILE_COUNT_INVALID');
      }
    } catch (error) {
      setSelectionError(toSafeUploadMessage(error));
      return;
    }

    const selected = await Promise.all(
      files.map(async (file, index): Promise<LocalUpload> => {
        try {
          await validatePdfFile(file);
          return {
            documentType: 'UNKNOWN',
            error: null,
            file,
            id: localFileId(file, index),
            status: 'ready',
          };
        } catch (error) {
          return {
            documentType: 'UNKNOWN',
            error: toSafeUploadMessage(error),
            file,
            id: localFileId(file, index),
            status: 'failed',
          };
        }
      }),
    );
    setLocalUploads((current) => [...current, ...selected]);
  };

  const uploadOne = async (item: LocalUpload) => {
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    updateLocalUpload(item.id, { error: null, status: 'hashing' });
    try {
      await uploadPdfFile({
        analysisId,
        apiClient: session.apiClient,
        documentType: item.documentType,
        file: item.file,
        onStep: (status) => updateLocalUpload(item.id, { status }),
        signal: controller.signal,
      });
      await documents.refetch();
      await analysis.refetch();
      setLocalUploads((current) =>
        current.filter((candidate) => candidate.id !== item.id),
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      updateLocalUpload(item.id, {
        error: toSafeUploadMessage(error),
        status: 'failed',
      });
    } finally {
      controllers.current.delete(item.id);
    }
  };

  const uploadAll = async () => {
    await Promise.all(uploadable.map(uploadOne));
  };

  function updateLocalUpload(
    id: string,
    update: Partial<Pick<LocalUpload, 'documentType' | 'error' | 'status'>>,
  ) {
    setLocalUploads((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  }

  const confirmDeleteAnalysis = async () => {
    if (
      !window.confirm(
        'この分析とアップロード済みPDFを削除します。よろしいですか？',
      )
    ) {
      return;
    }
    for (const controller of controllers.current.values()) controller.abort();
    await deleteAnalysis.mutateAsync().catch(() => undefined);
  };

  return (
    <ProtectedShell>
      <main className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
        <div className="mb-8 space-y-2">
          <p className="text-sm font-semibold text-emerald-700">Step 2 / 2</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            PDFを追加して分析を開始
          </h1>
          <p className="text-slate-600">
            公開IR
            PDFを最大3件追加できます。処理は最後のボタンを押すまで開始しません。
          </p>
        </div>

        {analysis.isError || documents.isError ? (
          <div
            className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            role="alert"
          >
            {toUserFacingErrorMessage(analysis.error ?? documents.error)}
          </div>
        ) : null}

        {analysis.data ? (
          <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">分析名</p>
            <h2 className="mt-1 text-xl font-semibold">
              {analysis.data.title}
            </h2>
          </section>
        ) : null}

        <section
          aria-labelledby="upload-heading"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h2 className="text-xl font-semibold" id="upload-heading">
                PDFファイル
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                1件20MB以下、PDF形式。残り {Math.max(0, availableSlots)}{' '}
                件です。
              </p>
            </div>
            <button
              className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:opacity-60"
              disabled={availableSlots <= 0 || isUploading}
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              PDFを選択
            </button>
            <input
              accept="application/pdf,.pdf"
              className="sr-only"
              multiple
              onChange={(event) => void selectFiles(event)}
              ref={inputRef}
              type="file"
            />
          </div>

          {selectionError ? (
            <p className="mt-4 text-sm text-red-700" role="alert">
              {selectionError}
            </p>
          ) : null}

          {localUploads.length > 0 ? (
            <ul aria-label="選択したPDF" className="mt-6 space-y-3">
              {localUploads.map((item) => (
                <li
                  className="rounded-lg border border-slate-200 p-4"
                  key={item.id}
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.file.name}</p>
                      <p
                        aria-live="polite"
                        className="mt-1 text-sm text-slate-600"
                      >
                        {formatBytes(item.file.size)} ・{' '}
                        {STATUS_LABELS[item.status]}
                      </p>
                      {item.error ? (
                        <p className="mt-1 text-sm text-red-700" role="alert">
                          {item.error}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <label
                        className="sr-only"
                        htmlFor={`document-type-${item.id}`}
                      >
                        {item.file.name} の資料種類
                      </label>
                      <select
                        className="rounded-md border border-slate-300 px-2 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:opacity-60"
                        disabled={
                          item.status !== 'ready' && item.status !== 'failed'
                        }
                        id={`document-type-${item.id}`}
                        onChange={(event) =>
                          updateLocalUpload(item.id, {
                            documentType: event.target.value as DocumentType,
                          })
                        }
                        value={item.documentType}
                      >
                        {DOCUMENT_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:opacity-60"
                        disabled={
                          item.status !== 'ready' && item.status !== 'failed'
                        }
                        onClick={() =>
                          setLocalUploads((current) =>
                            current.filter(
                              (candidate) => candidate.id !== item.id,
                            ),
                          )
                        }
                        type="button"
                      >
                        選択解除
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {uploadable.length > 0 ? (
            <button
              className="mt-5 rounded-md bg-slate-950 px-4 py-2.5 font-medium text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:opacity-60"
              disabled={isUploading}
              onClick={() => void uploadAll()}
              type="button"
            >
              {isUploading
                ? 'アップロード中…'
                : `選択したPDF ${uploadable.length}件をアップロード`}
            </button>
          ) : null}
        </section>

        <section
          aria-labelledby="documents-heading"
          className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
        >
          <h2 className="text-xl font-semibold" id="documents-heading">
            アップロード済みPDF
          </h2>
          {documents.isPending ? (
            <p aria-live="polite" className="mt-4 text-sm text-slate-600">
              PDF一覧を読み込んでいます…
            </p>
          ) : null}
          {finalizedDocuments.length === 0 && !documents.isPending ? (
            <p className="mt-4 text-sm text-slate-600">まだPDFはありません。</p>
          ) : null}
          {finalizedDocuments.length > 0 ? (
            <ul className="mt-4 divide-y divide-slate-200">
              {finalizedDocuments.map((document) => (
                <li
                  className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                  key={document.id}
                >
                  <div>
                    <p className="font-medium">{document.originalName}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatBytes(document.sizeBytes)} ・{' '}
                      {formatDateTime(document.uploadedAt)}
                    </p>
                  </div>
                  <button
                    className="w-fit rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"
                    disabled={deleteDocument.isPending || isUploading}
                    onClick={() => {
                      if (
                        window.confirm(
                          `${document.originalName} を削除しますか？`,
                        )
                      ) {
                        void deleteDocument
                          .mutateAsync(document.id)
                          .catch(() => undefined);
                      }
                    }}
                    type="button"
                  >
                    PDFを削除
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {deleteDocument.isError ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {toUserFacingErrorMessage(deleteDocument.error)}
            </p>
          ) : null}
        </section>

        <section
          aria-labelledby="start-heading"
          className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8"
        >
          <h2 className="text-xl font-semibold" id="start-heading">
            分析を開始
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {finalizedDocuments.length}
            件のPDFを使用します。開始後はPDFを変更できません。結果は公開資料の整理であり、投資助言ではありません。
          </p>
          {process.isError ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {toUserFacingErrorMessage(process.error)}
            </p>
          ) : null}
          <button
            className="mt-5 rounded-md bg-emerald-700 px-5 py-3 font-medium text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              finalizedDocuments.length === 0 ||
              localUploads.length > 0 ||
              isUploading ||
              process.isPending
            }
            onClick={() => void process.mutateAsync().catch(() => undefined)}
            type="button"
          >
            {process.isPending ? '開始しています…' : 'このPDFで分析を開始'}
          </button>
        </section>

        <div className="mt-8 border-t border-slate-200 pt-6">
          {deleteAnalysis.isError ? (
            <p className="mb-3 text-sm text-red-700" role="alert">
              {toUserFacingErrorMessage(deleteAnalysis.error)}
            </p>
          ) : null}
          <button
            className="text-sm font-medium text-red-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"
            disabled={deleteAnalysis.isPending}
            onClick={() => void confirmDeleteAnalysis()}
            type="button"
          >
            {deleteAnalysis.isPending ? '削除中…' : 'この分析を削除'}
          </button>
        </div>
      </main>
    </ProtectedShell>
  );
}

function localFileId(file: File, index: number): string {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

function toSafeUploadMessage(error: unknown): string {
  return error instanceof PdfUploadError
    ? error.message
    : toUserFacingErrorMessage(error);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
