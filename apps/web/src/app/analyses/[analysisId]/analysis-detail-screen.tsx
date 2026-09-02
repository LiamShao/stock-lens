'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { AnalysisViewsPanel } from '@/components/analysis-views/analysis-views-panel';
import { ProtectedShell } from '@/components/protected-shell';
import { SessionLoading } from '@/components/session-loading';
import {
  getAnalysisPollingInterval,
  isFailedAnalysisStatus,
} from '@/lib/analysis-polling';
import { toUserFacingErrorMessage } from '@/lib/api-client';
import { formatDateTime, statusLabel } from '@/lib/presentation';
import { useRequireSession } from '@/session/use-require-session';

export function AnalysisDetailScreen({ analysisId }: { analysisId: string }) {
  const session = useRequireSession();
  const [mountedAt] = useState(() => Date.now());
  const pollingState = useRef<{ analysisId: string; startedAt: number | null }>(
    {
      analysisId,
      startedAt: mountedAt,
    },
  );
  const analysis = useQuery({
    enabled: session.status === 'authenticated',
    queryFn: ({ signal }) => {
      if (pollingState.current.analysisId !== analysisId) {
        pollingState.current = { analysisId, startedAt: null };
      }
      pollingState.current.startedAt ??= Date.now();
      return session.apiClient.getAnalysis(analysisId, signal);
    },
    queryKey: ['analysis', analysisId],
    refetchInterval: (query) =>
      getAnalysisPollingInterval(
        query.state.data,
        pollingState.current.startedAt,
      ),
    refetchIntervalInBackground: false,
  });
  const views = useQuery({
    enabled:
      session.status === 'authenticated' &&
      analysis.data?.status === 'COMPLETED',
    queryFn: ({ signal }) =>
      session.apiClient.getAnalysisViews(analysisId, signal),
    queryKey: ['analysis-views', analysisId],
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (session.status !== 'authenticated') return <SessionLoading />;

  return (
    <ProtectedShell>
      <main className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <Link
          className="text-sm font-medium text-slate-600 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
          href="/analyses"
        >
          ← 分析履歴へ
        </Link>

        {analysis.isPending ? (
          <p aria-live="polite" className="mt-8 text-sm text-slate-600">
            分析情報を読み込んでいます…
          </p>
        ) : null}

        {analysis.isError ? (
          <div
            className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            role="alert"
          >
            <p>{toUserFacingErrorMessage(analysis.error)}</p>
            <button
              className="mt-3 rounded-md border border-red-300 px-3 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
              onClick={() => void analysis.refetch()}
              type="button"
            >
              再読み込み
            </button>
          </div>
        ) : null}

        {analysis.data ? (
          <div className="mt-8 space-y-8">
            <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-emerald-700">
                    Analysis detail
                  </p>
                  <h1 className="text-3xl font-semibold tracking-tight">
                    {analysis.data.title}
                  </h1>
                  <p className="text-sm text-slate-500">
                    作成 {formatDateTime(analysis.data.createdAt)} ・ 更新{' '}
                    {formatDateTime(analysis.data.updatedAt)}
                  </p>
                </div>
                <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                  {statusLabel(analysis.data.status)}
                </span>
              </div>
            </header>

            {analysis.data.status === 'COMPLETED' && views.isPending ? (
              <p aria-live="polite" className="text-sm text-slate-600">
                完成した分析ビューを読み込んでいます…
              </p>
            ) : null}

            {analysis.data.status === 'COMPLETED' && views.isError ? (
              <div
                className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                role="alert"
              >
                <p>{toUserFacingErrorMessage(views.error)}</p>
                <button
                  className="mt-3 rounded-md border border-red-300 px-3 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
                  onClick={() => void views.refetch()}
                  type="button"
                >
                  分析ビューを再読み込み
                </button>
              </div>
            ) : null}

            {views.data ? (
              <AnalysisViewsPanel
                requestDocumentDownload={(documentId, signal) =>
                  session.apiClient.createDocumentDownloadUrl(
                    analysisId,
                    documentId,
                    signal,
                  )
                }
                resource={views.data}
              />
            ) : null}

            {isFailedAnalysisStatus(analysis.data.status) ? (
              <section
                aria-labelledby="analysis-failed-heading"
                className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900"
              >
                <h2 className="font-semibold" id="analysis-failed-heading">
                  分析処理を完了できませんでした
                </h2>
                <p className="mt-2 text-sm">
                  {analysis.data.failureMessage ??
                    '保存された資料と処理状態を確認してください。'}
                </p>
              </section>
            ) : null}

            {analysis.data.status !== 'COMPLETED' &&
            !isFailedAnalysisStatus(analysis.data.status) ? (
              <section
                aria-live="polite"
                className="rounded-xl border border-slate-200 bg-white p-5"
              >
                <h2 className="font-semibold">分析を準備しています</h2>
                <p className="mt-2 text-sm text-slate-600">
                  現在の状態: {statusLabel(analysis.data.status)}
                  。処理中は最大5分間、5秒ごとに状態を更新します。
                </p>
                <button
                  className="mt-4 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
                  onClick={() => {
                    pollingState.current.startedAt = Date.now();
                    void analysis.refetch();
                  }}
                  type="button"
                >
                  状態を再確認
                </button>
              </section>
            ) : null}
          </div>
        ) : null}
      </main>
    </ProtectedShell>
  );
}
