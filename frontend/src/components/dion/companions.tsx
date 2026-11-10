"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, LogIn, MessageCircle, X } from "lucide-react";
import { ApiError, request } from "@/lib/dion/api";

export function Cat({ kind = "welcome", size = 120, className = "" }: { kind?: "welcome" | "coach" | "guide"; size?: number; className?: string }) {
  return <Image className={`d-cat ${className}`} src={`/dion/cat-${kind}.png`} alt="dion 고양이" width={size} height={size} sizes={`${size}px`} />;
}

export function HeaderCat() {
  return <div className="d-header-cat" aria-hidden="true"><div className="d-cat-travel"><div className="d-cat-turn"><div className="d-cat-play"><Cat size={48}/></div></div></div></div>;
}

const topics = [
  { title: "금액은 어떻게 적나요?", answer: "입력칸의 단위는 만원이에요. 300을 적으면 바로 아래에 3,000,000원으로 보여드려요. 실제로 없는 금액은 0, 아직 모르는 금액은 비워 두거나 ‘나중에 입력’을 눌러주세요." },
  { title: "상여금도 소득에 넣나요?", answer: "해당 달에 실제로 받은 세후 총소득에 포함해 적어주세요. ‘이번에만 받은 돈도 있어요’를 고르면 그중 일회성 금액을 따로 적을 수 있어요. 다시 더하지 않으며, 다음 달에도 받을 돈으로 자동 계산하지 않아요." },
  { title: "집과 대출은 어디에 적나요?", answer: "‘보유 부동산’에서 시세와 소유 지분을, ‘갚아야 할 돈’에서 대출을 적어주세요. 시세에서 대출을 미리 빼지 마세요. 부동산은 전체 자산에 포함하지만 바로 쓸 수 있는 현금으로 보지 않아요." },
  { title: "입력과 결과는 저장되나요?", answer: "계산 미리보기만으로 서버에 저장되지는 않아요. 로그인 후 상단 ‘내 상담’에서 상담을 만들고 초안을 저장해주세요. 결과와 확인한 미래 가정은 ‘저장된 입력으로 계산 기록’으로 함께 보관해요. 저장한 상담은 목록에서 다시 열 수 있어요. 미저장 답변은 새로고침하면 사라져요." },
  { title: "결과가 ‘확인 필요’로 나와요", answer: "관련 금액·기간·소유 지분이 빠졌거나 서로 다르면 해당 결과를 보류해요. 0으로 대신 계산하지 않아요. 결과 화면의 ‘확인하기’를 누르면 필요한 질문으로 이동할 수 있어요." },
];

export function ConsultationWidget({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<number | null>(null);
  const launcher = useRef<HTMLButtonElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) closeButton.current?.focus(); }, [open]);
  function close() { setOpen(false); launcher.current?.focus(); }
  return <div className="d-consultation">
    {open && <section role="dialog" aria-label="dion 상담 도움말" aria-modal="false" id="dion-help" className="d-help-window" onKeyDown={e => { if (e.key === "Escape") close(); }}>
      <header><Cat kind="coach" size={56} /><div><strong>dion 상담 도움말</strong><small>입력하면서 궁금한 점을 확인해요</small></div><button type="button" ref={closeButton} onClick={close} aria-label="상담창 닫기"><X size={20} /></button></header>
      <div className="d-help-body"><div className="d-chat-bubble">안녕하세요! 어떤 부분이 궁금하세요?<br/>아래 질문을 골라주세요.</div>
        {selected === null ? <div className="d-help-topics">{topics.map((topic, i) => <button type="button" key={topic.title} onClick={() => setSelected(i)}>{topic.title}<span aria-hidden="true">↗</span></button>)}</div> : <div aria-live="polite"><div className="d-chat-question">{topics[selected].title}</div><div className="d-chat-bubble">{topics[selected].answer}</div><button type="button" className="d-text-button" onClick={() => setSelected(null)}><ArrowLeft size={15} />다른 질문 보기</button></div>}
      </div><footer>자주 묻는 질문 안내 · AI·상담원 연결은 준비 중이에요.</footer>
    </section>}
    <button type="button" className={`d-help-launcher ${compact ? "compact" : ""}`} ref={launcher} aria-expanded={open} aria-controls="dion-help" aria-label={open ? "dion 상담 도움말 닫기" : "dion 상담 도움말 열기"} onClick={() => open ? close() : setOpen(true)}><Cat kind="guide" size={48} /><span>도움이 필요해요</span><MessageCircle size={19} /></button>
  </div>;
}

export function LoginDialog({ onClose, onLogin }: { onClose: () => void; onLogin: (token: string, expires: number) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), active = useRef(true);
  const submission = useRef<AbortController | null>(null);
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
    request("/api/be/v1/auth/status", "GET", undefined, undefined, controller.signal).then(v => { if (active.current && !controller.signal.aborted) setConfigured(v.configured === true); }).catch(() => { if (active.current && !controller.signal.aborted) setStatusError("로그인 서비스 상태를 확인하지 못했어요. 창을 닫고 다시 열어 시도해주세요."); });
    return () => { active.current = false; controller.abort(); submission.current?.abort(); element?.close(); };
  }, []);
  function switchMode(next: boolean) {
    if (busy) return;
    setSignup(next); setPassword(""); setConfirmation(""); setError(""); setNotice(""); setInputErrors({});
    heading.current?.focus();
  }
  function authError(value: unknown, joining: boolean) {
    if (value instanceof ApiError) {
      if (value.status === 408) return "응답 시간이 길어 요청을 끝냈어요. 가입을 요청했다면 이메일을 확인하거나 로그인한 뒤 다시 시도해주세요.";
      if (value.status === 429) return "시도가 많아요. 잠시 후 다시 시도해주세요.";
      if (value.code === "AUTH_WEAK_PASSWORD") return "비밀번호가 가입 정책에 맞지 않아요. 다른 비밀번호를 사용해주세요.";
      if (value.status === 422) return "이메일·비밀번호 또는 가입 설정을 확인해주세요. 가입 완료는 확인되지 않았어요.";
      if (value.status === 401) return "이메일 또는 비밀번호를 확인해주세요. 이메일 인증이 필요한 계정은 인증을 먼저 완료해주세요.";
      if (value.status === 503) return "계정 서비스가 연결되지 않았거나 응답하지 않아요. 완료 여부를 확인하지 못했어요. 잠시 후 다시 시도해주세요.";
    }
    return `${joining ? "가입" : "로그인"} 연결을 확인해주세요. 입력한 재무정보는 그대로 있어요.`;
  }
  function validSession(value: { access_token?: unknown; expires_in?: unknown }) {
    return typeof value.access_token === "string" && !!value.access_token && typeof value.expires_in === "number" && Number.isInteger(value.expires_in) && value.expires_in > 0 && value.expires_in <= 86400;
  }
  async function submitSignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || configured !== true) return;
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
    submission.current = new AbortController();
    try {
      const value = await request("/api/be/v1/auth/signup", "POST", { email: email.trim(), password }, undefined, submission.current.signal);
      if (!active.current) return;
      if (value.status === "SIGNED_IN" && validSession(value)) {
        onLogin(value.access_token, value.expires_in); onClose();
      } else if (value.status === "CHECK_EMAIL_OR_SIGN_IN") {
        setSignup(false);
        setNotice("가입 요청을 받았어요. 이메일 확인이 필요한 경우 확인한 뒤 로그인해주세요. 계정·메일 발송 완료 여부는 여기서 확인할 수 없어요.");
      } else throw new Error("invalid signup response");
    } catch (value) { if (active.current) setError(authError(value, true)); }
    finally { if (active.current) { setPassword(""); setConfirmation(""); setBusy(false); } }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || configured !== true) return;
    setBusy(true); setError("");
    submission.current = new AbortController();
    try {
      const value = await request("/api/be/v1/auth/login", "POST", { email: email.trim(), password }, undefined, submission.current.signal);
      if (!active.current) return;
      if (!validSession(value)) throw new Error();
      onLogin(value.access_token, value.expires_in); onClose();
    } catch (value) { if (active.current) setError(authError(value, false)); }
    finally { if (active.current) { setPassword(""); setBusy(false); } }
  }
  return <dialog className="d-login-dialog" ref={dialog} aria-labelledby="dion-login-title" onCancel={onClose}>
    <button type="button" className="d-dialog-close" aria-label={signup ? "회원가입 창 닫기" : "로그인 창 닫기"} onClick={onClose}><X /></button>
    <Cat size={105} /><span className="d-eyebrow">WELCOME TO DION</span><h2 id="dion-login-title" tabIndex={-1} ref={heading}>{signup ? "회원가입" : "만나서 반가워요"}</h2><p>{signup ? "이메일 계정으로 시작할 준비를 해요." : "이메일 계정으로 로그인해주세요."}</p>
    {configured === null && !statusError && <p role="status">계정 서비스 연결을 확인 중이에요.</p>}
    {configured === false && <p className="d-warning" role="status">계정 서비스 설정이 아직 연결되지 않았어요. 진단은 로그인 없이 시작할 수 있어요.</p>}
    {statusError && <p className="d-warning" role="alert">{statusError}</p>}
    {signup ? <>
      <p className="d-note">이메일로 가입을 신청해요. 이메일 확인이 필요한 경우 확인 후 로그인해주세요.</p>
      <form noValidate onSubmit={submitSignup}>
        <label className="d-field">이메일<input ref={emailInput} name="email" type="email" required autoComplete="email" maxLength={254} value={email} aria-invalid={!!inputErrors.email} aria-describedby={inputErrors.email ? "d-signup-email-error" : undefined} onChange={e=>setEmail(e.target.value)}/>{inputErrors.email&&<small id="d-signup-email-error" className="d-field-error">{inputErrors.email}</small>}</label>
        <label className="d-field">비밀번호<input name="password" type="password" required autoComplete="new-password" maxLength={1024} value={password} aria-invalid={!!inputErrors.password} aria-describedby="d-signup-policy d-signup-password-error" onChange={e=>setPassword(e.target.value)}/><small id="d-signup-password-error" className="d-field-error">{inputErrors.password}</small></label>
        <label className="d-field">비밀번호 확인<input name="confirmation" type="password" required autoComplete="new-password" maxLength={1024} value={confirmation} aria-invalid={!!inputErrors.confirmation} aria-describedby={inputErrors.confirmation ? "d-signup-confirmation-error" : undefined} onChange={e=>setConfirmation(e.target.value)}/>{inputErrors.confirmation&&<small id="d-signup-confirmation-error" className="d-field-error">{inputErrors.confirmation}</small>}</label>
        <p id="d-signup-policy" className="d-help">비밀번호는 8자 이상 입력해주세요. 추가 정책은 가입 서비스에서 확인해요.</p>
        {error&&<p className="d-warning" role="alert">{error}</p>}
        <button type="submit" className="d-primary" disabled={busy || configured !== true} aria-describedby="d-signup-policy">{busy ? "가입 확인 중…" : "회원가입"}</button>
      </form><button type="button" className="d-text-button" disabled={busy} onClick={()=>switchMode(false)}>로그인으로 돌아가기</button>
    </> : <><form onSubmit={submit}><label className="d-field">이메일<input type="email" required autoComplete="username" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label><label className="d-field">비밀번호<input type="password" required autoComplete="current-password" maxLength={1024} value={password} onChange={e => setPassword(e.target.value)} /></label>
      {notice && <p className="d-note" role="status">{notice}</p>}{error && <p className="d-warning" role="alert">{error}</p>}
      <button type="submit" className="d-primary" disabled={busy || configured !== true}><LogIn size={18} />{busy ? "로그인 중…" : "이메일로 로그인"}</button>
    </form><small>이 탭을 닫거나 로그인 시간이 지나면 다시 로그인해야 해요.</small><button type="button" className="d-text-button" disabled={busy} onClick={()=>switchMode(true)}>회원가입</button><button type="button" className="d-text-button" onClick={onClose}>로그인 없이 둘러보기</button></>}
  </dialog>;
}
