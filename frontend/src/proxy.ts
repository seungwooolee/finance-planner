import { NextResponse, type NextRequest } from "next/server";
import { BETA_COOKIE, betaCode, betaToken, sameSecret } from "@/lib/beta-gate";

// Pre-announcement closed beta: keep every response out of search engines, and when an
// access code is configured, require it before any page or proxied API call is served.
export function proxy(request: NextRequest) {
  const code = betaCode();
  const { pathname } = request.nextUrl;
  const open = pathname === "/beta" || pathname.startsWith("/beta/");
  if (code && !open) {
    const cookie = request.cookies.get(BETA_COOKIE)?.value ?? "";
    if (!sameSecret(cookie, betaToken(code))) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ detail: "BETA_ACCESS_REQUIRED" }, { status: 401, headers: { "X-Robots-Tag": "noindex, nofollow" } });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/beta";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
