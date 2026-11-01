import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Compass } from "lucide-react";
import { FrozenRiverCat } from "./frozen-river-cat";
import styles from "./not-found-screen.module.css";

export function NotFoundScreen() {
  return (
    <main className={styles.page}>
      <div className={styles.surface}>
        <Image
          src="/illustrations/frozen-han-river.webp" alt="" fill unoptimized
          loading="eager" sizes="100vw" className={styles.landscape}
        />
        <header className={styles.nav}>
          <Link href="/" className={styles.brand} aria-label="LifePath AI 홈">
            <Compass size={22} strokeWidth={1.6} aria-hidden="true" />
            <span>LifePath<span className={styles.ai}> AI</span></span>
          </Link>
          <span className={styles.navNote}>잠시, 다른 길로 왔네요.</span>
        </header>
        <section className={styles.illustration} aria-label="얼어붙은 한강의 고양이 일러스트">
          <p className={styles.errorCode} aria-hidden="true">404</p>
          <FrozenRiverCat />
        </section>
        <section className={styles.message} aria-labelledby="not-found-title">
          <p className={styles.eyebrow}>PAGE NOT FOUND</p>
          <h1 id="not-found-title"><span className={styles.srOnly}>404 오류. </span>앗, 이 길은 아닌가 봐요.</h1>
          <p className={styles.meme}>꽁꽁 얼어붙은 한강 위로<br className={styles.mobileBreak} /> 고양이가 걸어갑니다.</p>
          <p className={styles.description}>찾으시는 페이지가 없거나 주소가 바뀌었어요.<br />고양이와 함께 익숙한 곳으로 돌아갈까요?</p>
          <div className={styles.actions}>
            <Link href="/" className={styles.homeButton}><ArrowLeft size={17} aria-hidden="true" />홈으로 돌아가기</Link>
            <Link href="/login" className={styles.loginLink}>로그인 화면<ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </section>
        <footer className={styles.footer}>LifePath AI <span aria-hidden="true">·</span> 길을 잠깐 잃어도, 계획은 계속돼요.</footer>
      </div>
    </main>
  );
}
