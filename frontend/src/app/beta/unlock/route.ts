import { NextResponse, type NextRequest } from "next/server";
import { BETA_COOKIE, BETA_MAX_AGE, betaCode, betaToken, sameSecret } from "@/lib/beta-gate";

export async function POST(request: NextRequest) {
  const code = betaCode();
  const form = await request.formData();
  const entered = String(form.get("code") ?? "").trim();
  const target = request.nextUrl.clone();
  target.pathname = code && sameSecret(entered, code) ? "/dion" : "/beta";
  target.search = code && sameSecret(entered, code) ? "" : "?error=1";
  const response = NextResponse.redirect(target, 303);
  if (code && sameSecret(entered, code)) {
    response.cookies.set(BETA_COOKIE, betaToken(code), {
      httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: BETA_MAX_AGE,
    });
  }
  return response;
}
