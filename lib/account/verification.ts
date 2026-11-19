const SAFE_RETURN_PATHS = new Set(['/', '/account', '/new', '/preview/entry', '/create/upload', '/send']);

/** Accept only local account/builder destinations; reject protocol-relative and external URLs. */
export function safeVerificationReturnTo(value: unknown, origin: string): string {
  if (typeof value !== 'string' || !value.trim()) return '/account';
  const input = value.trim();
  if (!input.startsWith('/') || input.startsWith('//') || input.includes('\\')) return '/account';
  try {
    const parsed = new URL(input, origin);
    if (parsed.origin !== new URL(origin).origin) return '/account';
    const allowed = SAFE_RETURN_PATHS.has(parsed.pathname) || parsed.pathname.startsWith('/account/') || /^\/send(?:\/[a-z0-9-]+){1,2}\/?$/.test(parsed.pathname);
    if (!allowed) return '/account';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch { return '/account'; }
}

/** No-code returns come from Firebase's hosted action handler; only a refreshed
 * verified session proves success after that handler redirects back. */
export function hostedVerificationResult(signedIn: boolean, emailVerified: boolean): 'sign_in'|'verified'|'not_verified' {
  if (!signedIn) return 'sign_in';
  return emailVerified ? 'verified' : 'not_verified';
}
