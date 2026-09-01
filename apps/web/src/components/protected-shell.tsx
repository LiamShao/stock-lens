'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { useSession } from '@/session/session-provider';

export function ProtectedShell({ children }: { children: ReactNode }) {
  const { logout, user } = useSession();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch {
      // Local memory is cleared even if server-side revocation is unavailable.
    } finally {
      router.replace('/login');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link className="font-semibold tracking-tight" href="/analyses">
            StockLens AI
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">
              {user?.displayName ?? user?.email}
            </span>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-60"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
              type="button"
            >
              {isLoggingOut ? 'ログアウト中…' : 'ログアウト'}
            </button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
