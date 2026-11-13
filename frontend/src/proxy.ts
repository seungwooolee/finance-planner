import { NextRequest, NextResponse } from "next/server";
import { GATE_COOKIE, gateToken } from "@/lib/gate";

// Pre-award access gate: the contest entry must not be publicly reachable. When SITE_PASSWORD is
// set (Vercel env, never committed) pages redirect to the /gate password form and /api calls get
// 401 until the visitor enters it. HTTP Basic Auth is also accepted for scripted checks.
// Unset (local dev, E2E) leaves the site open.
export async function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname === "/gate") return NextResponse.next();
  if (request.cookies.get(GATE_COOKIE)?.value === await gateToken(password)) return NextResponse.next();
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      if (decoded.slice(decoded.indexOf(":") + 1) === password) return NextResponse.next();
    } catch { /* malformed header falls through */ }
  }
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (pathname.startsWith("/api/")) return new NextResponse("Authentication required", { status: 401, headers });
  const target = new URL("/gate", request.url);
  target.searchParams.set("next", pathname + search);
  return NextResponse.redirect(target, { headers });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"] };
