"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowLeft, LogIn, MessageCircle, X } from "lucide-react";

export function Cat({ kind = "welcome", size = 120, className = "", eager = false }: { kind?: "welcome" | "coach" | "guide"; size?: number; className?: string; eager?: boolean }) {
  return <Image className={`d-cat ${className}`} src={`/dion/cat-${kind}.png`} alt="dion 고양이" width={size} height={size} sizes={`${size}px`} loading={eager ? "eager" : undefined} />;
}

export function HeaderCat() {
  return <div className="d-header-cat" aria-hidden="true"><div className="d-cat-travel"><div className="d-cat-turn"><div className="d-cat-play"><Cat size={48}/></div></div></div></div>;
}

const topics = [
  { title: "금액은 어떻게 적나요?", answer: "입력칸의 단위는 만원이에요. 300을 적으면 바로 아래에 3,000,000원으로 보여드려요. 실제로 없는 금액은 0, 아직 모르는 금액은 비워 두거나 ‘나중에 입력’을 눌러주세요." },
  { title: "상여금도 소득에 넣나요?", answer: "해당 달에 실제로 받은 세후 총소득에 포함해 적어주세요. ‘이번에만 받은 돈도 있어요’를 고르면 그중 일회성 금액을 따로 적을 수 있어요. 다시 더하지 않으며, 다음 달에도 받을 돈으로 자동 계산하지 않아요." },
  { title: "집과 대출은 어디에 적나요?", answer: "‘보유 부동산’에서 시세와 소유 지분을, ‘갚아야 할 돈’에서 대출을 적어주세요. 시세에서 대출을 미리 빼지 마세요. 부동산은 전체 자산에 포함하지만 바로 쓸 수 있는 현금으로 보지 않아요." },
  { title: "입력과 결과는 저장되나요?", answer: "계산 미리보기만으로 서버에 저장되지는 않아요. 로그인 후 검토 도구의 초안 저장·복원에서 저장 상태를 확인할 수 있어요. 미저장 답변은 새로고침하면 사라지므로 필요하면 검토 JSON을 내보내주세요." },
  { title: "결과가 ‘확인 필요’로 나와요", answer: "관련 금액·기간·소유 지분이 빠졌거나 서로 다르면 해당 결과를 보류해요. 0으로 대신 계산하지 않아요. 결과 화면의 ‘확인하기’를 누르면 필요한 질문으로 이동할 수 있어요." },
];

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function ConsultationWidget({ compact = false, open, onOpen, onClose, children }: {
  compact?: boolean; open: boolean; onOpen: () => void; onClose: () => void; children: ReactNode;
}) {
  const hydrated = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const [selected, setSelected] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), launcher = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null), returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const element = dialog.current;
    const fallbackFocus = launcher.current;
    if (!element || !open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : launcher.current;
    element.showModal();
    closeButton.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      const target = returnFocus.current;
      (target?.isConnected ? target : fallbackFocus)?.focus({ preventScroll: true });
    };
  }, [open]);
  return <div className="d-consultation">
    <dialog ref={dialog} aria-labelledby="dion-help-title" id="dion-help" className="d-ai-window"
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
        )).filter(node => node.getClientRects().length > 0);
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onCancel={e => { e.preventDefault(); onClose(); }}>
      <header><Cat kind="coach" size={48}/><div><h2 id="dion-help-title">dion AI 상담</h2><small>현재 결과를 함께 살펴봐요</small></div>
        <button type="button" ref={closeButton} onClick={onClose} aria-label="상담창 닫기"><X size={20}/></button></header>
      <div className="d-ai-body">
        {children}
        <details className="d-ai-faq"><summary>입력 도움말 · 자주 묻는 질문</summary>
          {selected === null ? <div className="d-help-topics">{topics.map((topic, i) => <button type="button" key={topic.title} onClick={() => setSelected(i)}>{topic.title}<span aria-hidden="true">↗</span></button>)}</div>
            : <div aria-live="polite"><p className="d-chat-question">{topics[selected].title}</p><p className="d-chat-bubble">{topics[selected].answer}</p><button type="button" className="d-text-button" onClick={() => setSelected(null)}><ArrowLeft size={15}/>다른 질문 보기</button></div>}
        </details>
      </div>
    </dialog>
    <button type="button" className={`d-help-launcher ${compact ? "compact" : ""}`} ref={launcher}
      disabled={!hydrated} aria-busy={!hydrated} aria-expanded={open} aria-controls="dion-help" aria-haspopup="dialog" aria-label="dion AI 상담 열기" onClick={onOpen}>
      <Cat kind="guide" size={48}/><span>AI 상담</span><MessageCircle size={19}/></button>
  </div>;
}

export function LoginDialog({ onClose, onLogin }: { onClose: () => void; onLogin: (token: string, expires: number) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), active = useRef(true);
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false), [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState("");
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({});
  const emailInput = useRef<HTMLInputElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [configured, setConfigured] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    active.current = true; element?.showModal();
    const controller = new AbortController();
    fetch("/api/be/v1/auth/status", { cache: "no-store", signal: controller.signal }).then(async r => { if (!r.ok) throw new Error(); return r.json(); }).then(v => setConfigured(v.configured === true)).catch(() => { if (active.current && !controller.signal.aborted) setStatusError("로그인 서비스 상태를 확인하지 못했어요. 잠시 후 다시 시도해주세요."); });
    return () => { active.current = false; controller.abort(); element?.close(); };
  }, []);
  function switchMode(next: boolean) {
    setSignup(next); setPassword(""); setConfirmation(""); setError(""); setNotice(""); setInputErrors({});
    heading.current?.focus();
  }
  async function submitSignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || configured === false) return;
    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = "이메일을 입력해주세요.";
    else if (!emailInput.current?.validity.valid) errors.email = "이메일 형식을 확인해주세요.";
    if (!password) errors.password = "비밀번호를 입력해주세요.";
    else if (password.length < 8) errors.password = "비밀번호를 8자 이상 입력해주세요.";
    if (!confirmation) errors.confirmation = "비밀번호를 한 번 더 입력해주세요.";
    else if (password !== confirmation) errors.confirmation = "비밀번호가 서로 달라요.";
    setInputErrors(errors); setError("");
    if (Object.keys(errors).length) {
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${Object.keys(errors)[0]}"]`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/be/v1/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password }), cache: "no-store" });
      const value = await response.json();
      if (!active.current) return;
      if (!response.ok) {
        const code = value?.detail?.code;
        setError(response.status === 429 ? "시도가 많아요. 잠시 후 다시 시도해주세요." : code === "AUTH_WEAK_PASSWORD" ? "비밀번호가 가입 정책에 맞지 않아요. 다른 비밀번호를 사용해주세요." : response.status === 422 ? "이메일·비밀번호 또는 가입 설정을 확인해주세요." : "가입 요청을 확인하지 못했어요. 잠시 후 다시 시도해주세요.");
        return;
      }
      if (value.status === "SIGNED_IN" && typeof value.access_token === "string" && Number.isInteger(value.expires_in) && value.expires_in > 0) {
        onLogin(value.access_token, value.expires_in); onClose();
      } else if (value.status === "CHECK_EMAIL_OR_SIGN_IN") {
        setSignup(false);
        setNotice("가입 요청을 받았어요. 이메일 확인이 필요한 경우 확인한 뒤 로그인해주세요. 계정·메일 발송 완료 여부는 여기서 확인할 수 없어요.");
      } else throw new Error("invalid signup response");
    } catch { if (active.current) setError("가입 서비스 연결을 확인해주세요. 입력한 재무정보는 그대로 있어요."); }
    finally { if (active.current) { setPassword(""); setConfirmation(""); setBusy(false); } }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || configured === false) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/be/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }), cache: "no-store" });
      const value = await response.json();
      if (!active.current) return;
      if (!response.ok) { setError(response.status === 401 ? "이메일 또는 비밀번호를 확인해주세요. 이메일 인증이 필요한 계정은 인증을 먼저 완료해주세요." : response.status === 429 ? "시도가 많았어요. 잠시 후 다시 로그인해주세요." : "로그인 서비스에 연결하지 못했어요. 입력한 재무정보는 그대로 있어요."); return; }
      if (typeof value.access_token !== "string" || !value.access_token || !Number.isInteger(value.expires_in) || value.expires_in <= 0) throw new Error();
      onLogin(value.access_token, value.expires_in); onClose();
    } catch { if (active.current) setError("로그인 연결을 확인해주세요. 입력한 재무정보는 그대로 있어요."); }
    finally { if (active.current) { setPassword(""); setBusy(false); } }
  }
  return <dialog className="d-login-dialog" ref={dialog} aria-labelledby="dion-login-title" onCancel={onClose}>
    <button type="button" className="d-dialog-close" aria-label={signup ? "회원가입 창 닫기" : "로그인 창 닫기"} onClick={onClose}><X /></button>
    <Cat size={105} /><span className="d-eyebrow">WELCOME TO DION</span><h2 id="dion-login-title" tabIndex={-1} ref={heading}>{signup ? "회원가입" : "만나서 반가워요"}</h2><p>{signup ? "이메일 계정으로 시작할 준비를 해요." : "이메일 계정으로 로그인해주세요."}</p>
    {signup ? <>
      <p className="d-note">이메일로 가입을 신청해요. 이메일 확인이 필요한 경우 확인 후 로그인해주세요.</p>
      <form noValidate onSubmit={submitSignup}>
        <label className="d-field">이메일<input ref={emailInput} name="email" type="email" required autoComplete="email" maxLength={254} value={email} aria-invalid={!!inputErrors.email} aria-describedby={inputErrors.email ? "d-signup-email-error" : undefined} onChange={e=>setEmail(e.target.value)}/>{inputErrors.email&&<small id="d-signup-email-error" className="d-field-error">{inputErrors.email}</small>}</label>
        <label className="d-field">비밀번호<input name="password" type="password" required autoComplete="new-password" maxLength={1024} value={password} aria-invalid={!!inputErrors.password} aria-describedby="d-signup-policy d-signup-password-error" onChange={e=>setPassword(e.target.value)}/><small id="d-signup-password-error" className="d-field-error">{inputErrors.password}</small></label>
        <label className="d-field">비밀번호 확인<input name="confirmation" type="password" required autoComplete="new-password" maxLength={1024} value={confirmation} aria-invalid={!!inputErrors.confirmation} aria-describedby={inputErrors.confirmation ? "d-signup-confirmation-error" : undefined} onChange={e=>setConfirmation(e.target.value)}/>{inputErrors.confirmation&&<small id="d-signup-confirmation-error" className="d-field-error">{inputErrors.confirmation}</small>}</label>
        <p id="d-signup-policy" className="d-help">비밀번호는 8자 이상 입력해주세요. 추가 정책은 가입 서비스에서 확인해요.</p>
        {error&&<p className="d-warning" role="alert">{error}</p>}
        <button type="submit" className="d-primary" disabled={busy || configured !== true} aria-describedby="d-signup-policy">{busy ? "가입 확인 중…" : "회원가입"}</button>
      </form><button type="button" className="d-text-button" onClick={()=>switchMode(false)}>로그인으로 돌아가기</button>
    </> : <><form onSubmit={submit}><label className="d-field">이메일<input type="email" required autoComplete="username" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label><label className="d-field">비밀번호<input type="password" required autoComplete="current-password" maxLength={1024} value={password} onChange={e => setPassword(e.target.value)} /></label>
      {configured === false && <p className="d-warning" role="status">로그인 서비스 설정이 아직 연결되지 않았어요. 진단은 로그인 없이 시작할 수 있어요.</p>}{notice && <p className="d-note" role="status">{notice}</p>}{(error || statusError) && <p className="d-warning" role="alert">{error || statusError}</p>}
      <button type="submit" className="d-primary" disabled={busy || configured !== true}><LogIn size={18} />{busy ? "로그인 중…" : "이메일로 로그인"}</button>
    </form><small>이 탭을 닫거나 로그인 시간이 지나면 다시 로그인해야 해요.</small><button type="button" className="d-text-button" disabled={busy} onClick={()=>switchMode(true)}>회원가입</button><button type="button" className="d-text-button" onClick={onClose}>로그인 없이 둘러보기</button></>}
  </dialog>;
}
