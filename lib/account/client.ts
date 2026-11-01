'use client';
import type { User } from 'firebase/auth';

export class AccountClientError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message); }
}
/** Caller keys rendered data and pending state by captured UID; no shared private cache. */
export async function accountFetch<T>(user: User, path: string, init: RequestInit = {}): Promise<T> {
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new AccountClientError(payload?.error || 'Your account is unavailable. Please try again.', payload?.code || 'unavailable', response.status);
  return payload as T;
}
