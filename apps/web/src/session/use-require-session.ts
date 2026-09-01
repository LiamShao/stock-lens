'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useSession } from './session-provider';

export function useRequireSession() {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === 'unauthenticated') router.replace('/login');
  }, [router, session.status]);

  return session;
}
