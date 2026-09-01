'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, type LoginRequest } from '@stocklens/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { SessionLoading } from '@/components/session-loading';
import { toUserFacingErrorMessage } from '@/lib/api-client';
import { useSession } from '@/session/session-provider';

export function LoginScreen() {
  const { login, status } = useSession();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<LoginRequest>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(loginRequestSchema),
  });

  useEffect(() => {
    if (status === 'authenticated') router.replace('/analyses');
  }, [router, status]);

  if (status === 'loading' || status === 'authenticated') {
    return <SessionLoading />;
  }

  const submit = handleSubmit(async (input) => {
    setServerError(null);
    try {
      await login(input);
      router.replace('/analyses');
    } catch (error) {
      setServerError(toUserFacingErrorMessage(error));
    }
  });

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2">
      <section className="space-y-5">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Evidence-first company research
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          公開IR資料を、根拠ページと一緒に読み解く。
        </h1>
        <p className="max-w-xl text-lg leading-8 text-slate-600">
          StockLens AI は、アップロードした日本企業のIR
          PDFを整理する個人向けリサーチツールです。
        </p>
        <p className="text-sm text-slate-500">
          投資助言、売買推奨、目標株価、将来リターン予測は提供しません。
        </p>
      </section>

      <section
        aria-labelledby="login-heading"
        className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9"
      >
        <div className="mb-7 space-y-2">
          <h2 className="text-2xl font-semibold" id="login-heading">
            ログイン
          </h2>
          <p className="text-sm text-slate-600">
            登録済みのメールアドレスで続けます。
          </p>
        </div>
        <form className="space-y-5" noValidate onSubmit={submit}>
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="email">
              メールアドレス
            </label>
            <input
              aria-describedby={errors.email ? 'email-error' : undefined}
              aria-invalid={Boolean(errors.email)}
              autoComplete="email"
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              id="email"
              inputMode="email"
              type="email"
              {...register('email')}
            />
            {errors.email ? (
              <p className="text-sm text-red-700" id="email-error">
                有効なメールアドレスを入力してください。
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="password">
              パスワード
            </label>
            <input
              aria-describedby={errors.password ? 'password-error' : undefined}
              aria-invalid={Boolean(errors.password)}
              autoComplete="current-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              id="password"
              type="password"
              {...register('password')}
            />
            {errors.password ? (
              <p className="text-sm text-red-700" id="password-error">
                パスワードは12文字以上で入力してください。
              </p>
            ) : null}
          </div>

          {serverError ? (
            <p aria-live="polite" className="text-sm text-red-700" role="alert">
              {serverError}
            </p>
          ) : null}

          <button
            className="w-full rounded-md bg-slate-950 px-4 py-3 font-medium text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>
      </section>
    </main>
  );
}
