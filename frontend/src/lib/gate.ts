// Pre-award access gate shared by the proxy and the /gate route. Only the SHA-256 of the password
// travels in the cookie; the password itself is read from the SITE_PASSWORD environment variable.
export const GATE_COOKIE = "dion_gate";

export async function gateToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`dion-gate:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export function safeNext(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/gate") ? value : "/dion";
}
