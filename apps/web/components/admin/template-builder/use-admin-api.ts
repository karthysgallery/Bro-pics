'use client';

import { useCallback } from 'react';
import { useAuth } from '../../../lib/auth-context';

export class AdminApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'AdminApiError';
  }
}

/** Reads both error shapes the admin API uses: `{error: {message}}` and `{error: "…"}`. */
function errorMessage(body: unknown, status: number): string {
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') return (error as { message: string }).message;
  return `The request failed (HTTP ${status}).`;
}

/** fetch() for the admin API: adds the staff ID token and turns failures into readable errors. */
export function useAdminApi() {
  const { user } = useAuth();
  return useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      if (!user) throw new AdminApiError(401, 'Your session has ended. Sign in again to continue.');
      const token = await user.getIdToken();
      const res = await fetch(path, {
        ...init,
        headers: {
          ...(typeof init.body === 'string' && { 'Content-Type': 'application/json' }),
          ...init.headers,
          Authorization: `Bearer ${token}`,
        },
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        // A refused admin call may mean the 12-hour authenticator step ran out: ask for the code again.
        if (res.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('kg:admin-reverify'));
        throw new AdminApiError(res.status, errorMessage(body, res.status));
      }
      return body as T;
    },
    [user]
  );
}
