"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Compass, Eye, EyeOff } from "lucide-react";
import { GazeCat } from "./gaze-cat";
import styles from "./login-screen.module.css";

export function LoginScreen() {
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const privacyMode = passwordFocused || passwordVisible;

  function preventUnconnectedSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordRef.current) passwordRef.current.value = "";
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero} aria-label="LifePath와 함께하는 내일">
          <Link className={styles.brand} href="/" aria-label="LifePath AI 홈">
            <span className={styles.brandIcon}><Compass size={22} strokeWidth={1.7} aria-hidden="true" /></span>
            <span>LifePath<span className={styles.ai}> AI</span></span>
          </Link>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>YOUR NEXT CHAPTER</p>
            <h1>내일의 선택을,<br />오늘 조금 더 가볍게.</h1>
            <p className={styles.heroDescription}>복잡했던 돈 이야기, 이제 나의 속도로.<br />나에게 맞는 미래를 함께 그려봐요.</p>
          </div>
          <div className={styles.heroArt}>
            <GazeCat lookAway={privacyMode} />
            <p className={styles.catCaption} aria-live="polite">
              {privacyMode ? "비밀번호를 입력하는 동안은 다른 곳을 볼게요." : "당신의 다음 걸음을 함께할게요."}
            </p>
          </div>
          <p className={styles.heroFooter}>작은 선택에서 시작되는, 더 선명한 내일.</p>
        </section>

        <section className={styles.formPanel} aria-labelledby="login-heading">
          <div className={styles.formContent}>
            <span className={styles.welcomeMark} aria-hidden="true"><Compass size={32} strokeWidth={1.3} /></span>
            <p className={styles.formEyebrow}>WELCOME TO LIFEPATH</p>
            <h2 id="login-heading">다시 만나 반가워요.</h2>
            <p className={styles.formDescription}>나를 위한 계획, 여기서 이어가요.</p>
            <form className={styles.form} aria-describedby="login-availability" onSubmit={preventUnconnectedSignIn}>
              <div className={styles.field}>
                <label htmlFor="login-email">이메일</label>
                <input id="login-email" name="email" type="email" autoComplete="off" placeholder="you@example.com" />
              </div>
              <div className={styles.field}>
                <label htmlFor="login-password">비밀번호</label>
                <div className={styles.passwordField}>
                  <input
                    ref={passwordRef} id="login-password" name="password"
                    type={passwordVisible ? "text" : "password"} autoComplete="off"
                    placeholder="비밀번호를 입력해 주세요"
                    onFocus={() => setPasswordFocused(true)} onBlur={() => setPasswordFocused(false)}
                  />
                  <button
                    type="button" className={styles.eyeButton}
                    aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
                    aria-pressed={passwordVisible} onClick={() => setPasswordVisible((value) => !value)}
                  >
                    {passwordVisible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <p id="login-availability" className={styles.availability}>계정 로그인은 준비 중이에요. 먼저 체험해 보세요.</p>
              <button type="submit" disabled className={styles.loginButton}>계정 로그인 준비 중</button>
              <Link href="/" className={styles.demoButton}>로그인 없이 체험하기<ArrowRight size={18} aria-hidden="true" /></Link>
            </form>
          </div>
          <p className={styles.panelFooter}>LifePath AI <span aria-hidden="true">·</span> 나의 속도로 준비하는 내일</p>
        </section>
      </div>
    </main>
  );
}
