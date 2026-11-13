import { NextRequest, NextResponse } from "next/server";

// Pre-award access gate: the contest entry must not be publicly reachable. When SITE_PASSWORD is
// set (Vercel env, never committed), every page and /api proxy request needs HTTP Basic Auth.
// Unset (local dev, E2E) leaves the site open.
export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      if (decoded.slice(decoded.indexOf(":") + 1) === password) return NextResponse.next();
    } catch { /* malformed header falls through to the challenge */ }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="DION review", charset="UTF-8"', "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"] };
