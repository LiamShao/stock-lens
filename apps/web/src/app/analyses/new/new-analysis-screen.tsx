'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createAnalysisRequestSchema,
  type CreateAnalysisRequest,
} from '@stocklens/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { ProtectedShell } from '@/components/protected-shell';
import { SessionLoading } from '@/components/session-loading';
import { toUserFacingErrorMessage } from '@/lib/api-client';
import { useRequireSession } from '@/session/use-require-session';

export function NewAnalysisScreen() {
  const session = useRequireSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<CreateAnalysisRequest>({
    defaultValues: { companyId: null, title: '' },
    resolver: zodResolver(createAnalysisRequestSchema),
  });
  const create = useMutation({
    mutationFn: (input: CreateAnalysisRequest) =>
      session.apiClient.createAnalysis(input),
    onSuccess: (analysis) => {
      void queryClient.invalidateQueries({ queryKey: ['analyses'] });
      router.replace(`/analyses/${analysis.id}/intake`);
    },
  });

  if (session.status !== 'authenticated') return <SessionLoading />;

  const submit = handleSubmit(async (input) => {
    setServerError(null);
    try {
      await create.mutateAsync({ companyId: null, title: input.title });
    } catch (error) {
      setServerError(toUserFacingErrorMessage(error));
    }
  });

  return (
    <ProtectedShell>
      <main className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
        <div className="mb-8 space-y-2">
          <p className="text-sm font-semibold text-emerald-700">Step 1 / 2</p>
          <h1 className="text-3xl font-semibold tracking-tight">新しい分析</h1>
          <p className="text-slate-600">
            分析を識別しやすい名前を入力します。会社情報は資料から抽出します。
          </p>
        </div>

        <form
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
          noValidate
          onSubmit={submit}
        >
          <div className="space-y-2">
            <label
              className="block text-sm font-medium"
              htmlFor="analysis-title"
            >
              分析名
            </label>
            <input
              aria-describedby={
                errors.title ? 'analysis-title-error' : 'analysis-title-help'
              }
              aria-invalid={Boolean(errors.title)}
              autoFocus
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              id="analysis-title"
              maxLength={120}
              placeholder="例：任天堂 2026年3月期 決算分析"
              {...register('title')}
            />
            <p className="text-xs text-slate-500" id="analysis-title-help">
              1〜120文字。後から変更できます。
            </p>
            {errors.title ? (
              <p className="text-sm text-red-700" id="analysis-title-error">
                分析名を1〜120文字で入力してください。
              </p>
            ) : null}
          </div>

          {serverError ? (
            <p className="mt-4 text-sm text-red-700" role="alert">
              {serverError}
            </p>
          ) : null}

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              className="rounded-md border border-slate-300 px-4 py-2.5 font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
              onClick={() => router.replace('/analyses')}
              type="button"
            >
              キャンセル
            </button>
            <button
              className="rounded-md bg-slate-950 px-4 py-2.5 font-medium text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:opacity-60"
              disabled={create.isPending}
              type="submit"
            >
              {create.isPending ? '作成中…' : 'PDF追加へ進む'}
            </button>
          </div>
        </form>
      </main>
    </ProtectedShell>
  );
}
