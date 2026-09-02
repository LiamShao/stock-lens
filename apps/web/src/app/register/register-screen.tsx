'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerRequestSchema, type RegisterRequest } from '@stocklens/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { SessionLoading } from '@/components/session-loading';
import { toUserFacingErrorMessage } from '@/lib/api-client';
import { useSession } from '@/session/session-provider';

export function RegisterScreen() {
  const { registerAccount, status } = useSession();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    resetField,
  } = useForm<RegisterRequest>({
    defaultValues: { displayName: '', email: '', password: '' },
    resolver: zodResolver(registerRequestSchema),
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
      await registerAccount(input);
      resetField('password');
      router.replace('/analyses');
    } catch (error) {
      resetField('password');
      setServerError(toUserFacingErrorMessage(error));
    }
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
      <section
        aria-labelledby="register-heading"
        className="w-full rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9"
      >
        <div className="mb-7 space-y-2">
          <p className="text-sm font-semibold text-emerald-700">StockLens AI</p>
          <h1 className="text-3xl font-semibold" id="register-heading">
            アカウントを作成
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            公開IR資料を根拠ページと一緒に整理します。投資助言は提供しません。
          </p>
        </div>

        <form className="space-y-5" noValidate onSubmit={submit}>
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="displayName">
              表示名（任意）
            </label>
            <input
              aria-describedby={
                errors.displayName ? 'display-name-error' : undefined
              }
              aria-invalid={Boolean(errors.displayName)}
              autoComplete="name"
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              id="displayName"
              {...register('displayName', {
                setValueAs: (value: string) => value.trim() || undefined,
              })}
            />
            {errors.displayName ? (
              <p className="text-sm text-red-700" id="display-name-error">
                表示名は80文字以内で入力してください。
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label
              className="block text-sm font-medium"
              htmlFor="register-email"
            >
              メールアドレス
            </label>
            <input
              aria-describedby={
                errors.email ? 'register-email-error' : undefined
              }
              aria-invalid={Boolean(errors.email)}
              autoComplete="email"
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              id="register-email"
              inputMode="email"
              type="email"
              {...register('email')}
            />
            {errors.email ? (
              <p className="text-sm text-red-700" id="register-email-error">
                有効なメールアドレスを入力してください。
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label
              className="block text-sm font-medium"
              htmlFor="register-password"
            >
              パスワード
            </label>
            <input
              aria-describedby={
                errors.password ? 'register-password-error' : 'password-help'
              }
              aria-invalid={Boolean(errors.password)}
              autoComplete="new-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              id="register-password"
              type="password"
              {...register('password')}
            />
            <p className="text-xs text-slate-500" id="password-help">
              12〜128文字で入力してください。
            </p>
            {errors.password ? (
              <p className="text-sm text-red-700" id="register-password-error">
                パスワードは12〜128文字で入力してください。
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
            {isSubmitting ? '作成中…' : 'アカウントを作成'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          登録済みの場合は{' '}
          <Link
            className="font-medium text-emerald-700 hover:underline"
            href="/login"
          >
            ログイン
          </Link>
        </p>
      </section>
    </main>
  );
}
