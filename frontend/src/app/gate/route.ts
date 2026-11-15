import { NextRequest, NextResponse } from "next/server";
import { GATE_COOKIE, gateToken, safeNext } from "@/lib/gate";

const page = (next: string, failed: boolean) => `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>DION 심사용 접근</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fbf7f1;font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;color:#2a2622}
form{width:min(92vw,360px);padding:28px;border-radius:16px;background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.08);display:grid;gap:14px}
h1{margin:0;font-size:20px}p{margin:0;font-size:14px;color:#6b635a}label{display:grid;gap:6px;font-size:14px}
input{padding:12px;border:1px solid #cfc6ba;border-radius:10px;font-size:16px}
button{padding:12px;border:0;border-radius:10px;background:#2a2622;color:#fff;font-size:16px;cursor:pointer}
.e{color:#b3261e;font-size:14px}</style></head><body>
<form method="post" action="/gate"><h1>DION 심사용 접근</h1>
<p>비공개 시연이에요. 전달받은 접근 비밀번호를 입력해주세요.</p>
<input type="hidden" name="next" value="${next.replace(/[&"<>]/g, c => `&#${c.charCodeAt(0)};`)}">
<label>접근 비밀번호<input name="password" type="password" autocomplete="current-password" autofocus required></label>
${failed ? '<div class="e" role="alert">비밀번호가 맞지 않아요.</div>' : ""}
<button type="submit">입장</button></form></body></html>`;

const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export function GET(request: NextRequest) {
  return new NextResponse(page(safeNext(request.nextUrl.searchParams.get("next")), false), { headers });
}

export async function POST(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? ""));
  if (!password) return NextResponse.redirect(new URL(next, request.url), 303);
  if (form.get("password") !== password) {
    await new Promise(resolve => setTimeout(resolve, 800)); // slow down guessing
    return new NextResponse(page(next, true), { status: 401, headers });
  }
  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(GATE_COOKIE, await gateToken(password), {
    httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: 60 * 60 * 12,
  });
  return response;
}
