import type { Metadata } from "next";

export const metadata: Metadata = { title: "dion · 비공개 베타", robots: { index: false, follow: false } };

export default async function BetaPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#faf8ff", fontFamily: '"Malgun Gothic","Apple SD Gothic Neo",sans-serif', color: "#161b29", padding: 24 }}>
      <form method="post" action="/beta/unlock" style={{ width: "100%", maxWidth: 420, background: "#fff", border: "1px solid #e3e7fb", borderRadius: 20, padding: 32 }}>
        <p style={{ fontSize: 34, fontWeight: 850, letterSpacing: -2, margin: 0 }}>dion<span style={{ color: "#3848ce" }}>.</span></p>
        <h1 style={{ fontSize: 20, margin: "18px 0 8px" }}>초대받은 분만 이용할 수 있는 비공개 베타예요</h1>
        <p style={{ fontSize: 13, color: "#555965", lineHeight: 1.8, margin: "0 0 18px" }}>
          안내받은 접근 코드를 입력해 주세요. 실제 개인정보 대신 가상의 숫자로 이용해 주세요. 이 주소와 코드는 다른 곳에 공유하지 말아 주세요.
        </p>
        <label style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
          접근 코드
          <input name="code" type="password" autoComplete="off" required style={{ minHeight: 44, border: "1px solid #dfe2f1", borderRadius: 10, padding: "9px 12px", fontSize: 15 }} />
        </label>
        {error ? <p role="alert" style={{ color: "#a33c1f", fontSize: 13, margin: "10px 0 0" }}>코드가 맞지 않아요. 다시 확인해 주세요.</p> : null}
        <button type="submit" style={{ marginTop: 18, width: "100%", minHeight: 46, border: 0, borderRadius: 11, background: "#3848ce", color: "#fff", fontWeight: 650, fontSize: 14, cursor: "pointer" }}>
          입장하기
        </button>
      </form>
    </main>
  );
}
