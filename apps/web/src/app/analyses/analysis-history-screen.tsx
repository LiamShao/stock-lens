'use client';

import { useQuery } from '@tanstack/react-query';
import type { AnalysisPageResponse } from '@stocklens/shared';
import Link from 'next/link';
import { useRef } from 'react';

import { ProtectedShell } from '@/components/protected-shell';
import { SessionLoading } from '@/components/session-loading';
import { toUserFacingErrorMessage } from '@/lib/api-client';
import { getHistoryPollingInterval } from '@/lib/analysis-polling';
import { formatDateTime, statusLabel } from '@/lib/presentation';
import { useRequireSession } from '@/session/use-require-session';

export function AnalysisHistoryScreen() {
  const session = useRequireSession();
  const pollingStartedAt = useRef<number | null>(null);
  const analyses = useQuery<AnalysisPageResponse>({
    enabled: session.status === 'authenticated',
    queryFn: ({ signal }) => {
      pollingStartedAt.current ??= Date.now();
      return session.apiClient.listAnalyses({ limit: 20 }, signal);
    },
    refetchInterval: (query) =>
      getHistoryPollingInterval(query.state.data, pollingStartedAt.current),
    refetchIntervalInBackground: false,
    queryKey: ['analyses', { limit: 20 }],
  });

  if (session.status !== 'authenticated') return <SessionLoading />;

  return (
    <ProtectedShell>
      <main className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <div className="mb-8 space-y-2">
          <p className="text-sm font-semibold text-emerald-700">
            Analysis history
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">分析履歴</h1>
          <p className="text-slate-600">
            アップロード済み資料の処理状況と完成した分析を確認できます。
          </p>
        </div>

        {analyses.isPending ? (
          <p aria-live="polite" className="text-sm text-slate-600">
            分析履歴を読み込んでいます…
          </p>
        ) : null}

        {analyses.isError ? (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            role="alert"
          >
            <p>{toUserFacingErrorMessage(analyses.error)}</p>
            <button
              className="mt-3 rounded-md border border-red-300 px-3 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
              onClick={() => void analyses.refetch()}
              type="button"
            >
              再読み込み
            </button>
          </div>
        ) : null}

        {analyses.data?.items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h2 className="font-semibold">分析はまだありません</h2>
            <p className="mt-2 text-sm text-slate-600">
              Analysis作成・PDFアップロード画面は今後のタスクで追加します。
            </p>
          </div>
        ) : null}

        {analyses.data?.items.length ? (
          <ul className="grid gap-4">
            {analyses.data.items.map((analysis) => (
              <li key={analysis.id}>
                <Link
                  className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
                  href={`/analyses/${analysis.id}`}
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                      <h2 className="font-semibold">{analysis.title}</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        更新 {formatDateTime(analysis.updatedAt)}
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                      {statusLabel(analysis.status)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </ProtectedShell>
  );
}
