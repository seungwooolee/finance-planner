// Tab-scoped access token only. Passwords, refresh tokens and answers are never stored here.
const key = "dion.session.v1";
export type Session = { token: string; expiresAt: number };
export function clearSession() {
  try { sessionStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
}
export function readSession(): Session | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (typeof value?.token === "string" && value.token.length > 0 && value.token.length <= 16384
        && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now()
        && value.expiresAt <= Date.now() + 86400_000) return value;
  } catch { /* Invalid or unavailable storage means signed out. */ }
  clearSession();
  return null;
}
export function rememberSession(token: string, seconds: number): number {
  const expiresAt = Date.now() + seconds * 1000;
  try { sessionStorage.setItem(key, JSON.stringify({ token, expiresAt })); } catch { /* Keep the in-memory session. */ }
  return expiresAt;
}
