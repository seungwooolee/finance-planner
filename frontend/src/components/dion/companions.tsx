"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { LogIn, MessageCircle, X } from "lucide-react";
import { ApiError, requestJson, type WakeState } from "@/lib/dion/wake-retry";
import { ServerWakeNotice } from "@/components/server-wake-notice";

export function Cat({ kind = "welcome", size = 120, className = "", eager = false }: { kind?: "welcome" | "coach" | "guide"; size?: number; className?: string; eager?: boolean }) {
  return <Image className={`d-cat ${className}`} src={`/dion/cat-${kind}.png`} alt="dion 고양이" width={size} height={size} sizes={`${size}px`} loading={eager ? "eager" : undefined} />;
}

export function HeaderCat() {
  return <div className="d-header-cat" aria-hidden="true"><div className="d-cat-travel"><div className="d-cat-turn"><div className="d-cat-play"><Cat size={48}/></div></div></div></div>;
}

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function ConsultationWidget({ compact = false, open, onOpen, onClose, children }: {
  compact?: boolean; open: boolean; onOpen: () => void; onClose: () => void; children: ReactNode;
}) {
  const hydrated = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
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
      <header><Cat kind="coach" size={48}/><div><h2 id="dion-help-title">dion AI 상담</h2><small>설문부터 결과까지 함께해요</small></div>
        <button type="button" ref={closeButton} onClick={onClose} aria-label="상담창 닫기"><X size={20}/></button></header>
      <div className="d-ai-body">
        {children}

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
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [wake, setWake] = useState<WakeState>({ waiting: false, exhausted: false });
  const loginRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const element = dialog.current;
    active.current = true; element?.showModal();
    const controller = new AbortController();
    const pendingNotice = setTimeout(() => { if (!controller.signal.aborted) setWake({ waiting: true, exhausted: false }); }, 1000);
    void requestJson("/api/be/v1/auth/status", { signal: controller.signal, onState: state => {
      if (!controller.signal.aborted) setWake(state);
    } }).then(value => {
      if (controller.signal.aborted) return;
      if (typeof value?.configured !== "boolean") throw new Error("INVALID_AUTH_STATUS");
      setConfigured(value.configured); setStatusError("");
    }).catch(() => {
      if (!controller.signal.aborted) setStatusError("로그인 서비스 상태를 확인하지 못했어요. 다시 시도해주세요.");
    }).finally(() => clearTimeout(pendingNotice));
    return () => { active.current = false; controller.abort(); loginRequest.current?.abort(); clearTimeout(pendingNotice); element?.close(); };
  }, [statusAttempt]);
  function retryStatus() {
    setStatusError(""); setWake({ waiting: false, exhausted: false }); setConfigured(null);
    setStatusAttempt(value => value + 1);
  }
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
    event.preventDefault(); if (busy || configured !== true || loginRequest.current) return;
    const controller = new AbortController(); loginRequest.current = controller;
    setBusy(true); setError("");
    try {
      const value = await requestJson("/api/be/v1/auth/login", { method: "POST", body: { email: email.trim(), password }, signal: controller.signal,
        onState: state => { if (!controller.signal.aborted) setWake(state); } });
      if (controller.signal.aborted) return;
      if (typeof value.access_token !== "string" || !value.access_token || !Number.isInteger(value.expires_in) || value.expires_in <= 0) throw new Error();
      onLogin(value.access_token, value.expires_in); onClose();
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof ApiError && failure.status === 401
        ? "이메일 또는 비밀번호를 확인해주세요. 이메일 인증이 필요한 계정은 인증을 먼저 완료해주세요."
        : failure instanceof ApiError && failure.status === 429 ? "시도가 많았어요. 잠시 후 다시 로그인해주세요."
        : "로그인 연결을 확인해주세요. 비밀번호를 다시 입력한 뒤 로그인해주세요. 작성한 재무정보는 그대로 있어요.");
    } finally { loginRequest.current = null; if (active.current) { setPassword(""); setBusy(false); } }
  }
  return <dialog className="d-login-dialog" ref={dialog} aria-labelledby="dion-login-title" onCancel={onClose}>
    <button type="button" className="d-dialog-close" aria-label={signup ? "회원가입 창 닫기" : "로그인 창 닫기"} onClick={onClose}><X /></button>
    <Cat size={105} /><span className="d-eyebrow">WELCOME TO DION</span><h2 id="dion-login-title" tabIndex={-1} ref={heading}>{signup ? "회원가입" : "만나서 반가워요"}</h2>{signup&&<p>이메일 계정으로 시작할 준비를 해요.</p>}
    <ServerWakeNotice waiting={wake.waiting} exhausted={false} onRetry={retryStatus}/>
    {statusError && <div role="alert"><p>{statusError}</p><button type="button" className="d-secondary" onClick={retryStatus}>로그인 연결 다시 시도</button></div>}
    {configured === null && !statusError && !wake.waiting && <p role="status">로그인 서비스를 연결하고 있어요…</p>}
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
      {configured === false && <p className="d-warning" role="status">로그인 서비스 설정이 아직 연결되지 않았어요. 진단은 로그인 없이 시작할 수 있어요.</p>}{notice && <p className="d-note" role="status">{notice}</p>}{error && <p className="d-warning" role="alert">{error}</p>}
      <button type="submit" className="d-primary" disabled={busy || configured !== true}><LogIn size={18} />{busy ? "로그인 중…" : "이메일로 로그인"}</button>
    </form><button type="button" className="d-text-button" disabled={busy} onClick={()=>switchMode(true)}>회원가입</button><button type="button" className="d-text-button" onClick={onClose}>로그인 없이 둘러보기</button></>}
  </dialog>;
}
