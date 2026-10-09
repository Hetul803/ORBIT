/** Cache namespace only, not token verification or authorization. The API verifies JWTs. */
export const offlineScope = (token: string | null): string | null => {
  if (token === null) return null;
  try {
    const payload = token.split('.')[1];
    if (payload === undefined) return null;
    const decoded: unknown = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/')));
    if (typeof decoded !== 'object' || decoded === null) return null;
    const sub = (decoded as { sub?: unknown }).sub;
    return typeof sub === 'string' && /^[A-Za-z0-9_-]{8,128}$/u.test(sub) ? sub : null;
  } catch {
    return null;
  }
};
