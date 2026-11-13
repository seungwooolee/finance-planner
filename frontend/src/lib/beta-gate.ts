import { createHash, timingSafeEqual } from "node:crypto";

// Closed-beta gate. Active only when DION_BETA_ACCESS_CODE is set in the deployment environment.
// The cookie stores a hash of the code, never the code itself.
export const BETA_COOKIE = "dion_beta";
export const BETA_MAX_AGE = 60 * 60 * 24 * 30;

export function betaCode(): string | null {
  const code = process.env.DION_BETA_ACCESS_CODE?.trim();
  return code ? code : null;
}

export function betaToken(code: string): string {
  return createHash("sha256").update(`dion-beta:${code}`).digest("hex");
}

export function sameSecret(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}
