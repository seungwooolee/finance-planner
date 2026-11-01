"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Cat, EyeOff, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./cat-companion.module.css";

type Preference = "walking" | "paused" | "hidden";

const STORAGE_KEY = "lifepath.cat.preferences.v1";
const CHANGE_EVENT = "lifepath-cat-preference-change";
let memoryPreference: Preference = "walking";
let storageUnavailable = false;

function readPreference(): Preference {
  if (storageUnavailable) return memoryPreference;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "paused" || value === "hidden" ? value : "walking";
  } catch {
    return memoryPreference;
  }
}

function savePreference(value: Preference) {
  memoryPreference = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
    storageUnavailable = false;
  } catch {
    storageUnavailable = true;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribePreference(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      storageUnavailable = false;
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const serverPreference = (): Preference => "walking";
const motionQuery = () => window.matchMedia("(prefers-reduced-motion: reduce)");
const readReducedMotion = () => motionQuery().matches;
const serverReducedMotion = () => true;

function subscribeReducedMotion(onChange: () => void) {
  const query = motionQuery();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// Bounds in the 1536×1024 source atlas. The WebP is half that size.
// Each frame is aligned at the feet using one scale, without stretching it.
const FRAMES = [
  [9, 153, 498, 275],
  [528, 155, 482, 273],
  [1030, 154, 489, 275],
  [15, 611, 483, 270],
  [521, 610, 486, 270],
  [1031, 610, 490, 270],
] as const;

export function CatCompanion() {
  const preference = useSyncExternalStore(
    subscribePreference,
    readPreference,
    serverPreference,
  );
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    readReducedMotion,
    serverReducedMotion,
  );
  const [greeting, setGreeting] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const petRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const greetingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movement = useRef({ x: 20, direction: 1, elapsed: 0 });
  const hidden = preference === "hidden";
  const paused = preference === "paused" || reducedMotion;

  useEffect(() => () => {
    if (greetingTimer.current !== null) clearTimeout(greetingTimer.current);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    const pet = petRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (hidden || !rail || !pet || !canvas || !ctx) return;

    const image = new Image();
    let disposed = false;
    let ready = false;
    let onScreen = true;
    let maxX = 0;
    let frameId: number | null = null;
    let previous = 0;
    let turnUntil = 0;
    const current = movement.current;

    function draw(frame: number) {
      if (!ready || !canvas || !ctx) return;
      const [sx, sy, sw, sh] = FRAMES[frame];
      const scale = 470 / 498;
      const width = sw * scale;
      const height = sh * scale;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      if (current.direction < 0) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(
        image, sx / 2, sy / 2, sw / 2, sh / 2,
        (canvas.width - width) / 2, canvas.height - height - 3, width, height,
      );
      ctx.restore();
    }

    function position() {
      if (!pet) return;
      pet.style.transform = `translateX(${current.x.toFixed(2)}px)`;
      pet.dataset.direction = current.direction < 0 ? "left" : "right";
    }

    const canWalk = () => !disposed && ready && !paused && !greeting &&
      !document.hidden && onScreen && maxX > 0;

    function tick(now: number) {
      frameId = null;
      if (!canWalk()) return;
      const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
      previous = now;
      const turning = now < turnUntil;
      if (!turning) {
        current.elapsed += dt;
        current.x += current.direction * 39 * dt;
        if (current.x >= maxX) {
          current.x = maxX;
          current.direction = -1;
          turnUntil = now + 450;
        } else if (current.x <= 0) {
          current.x = 0;
          current.direction = 1;
          turnUntil = now + 450;
        }
      }
      position();
      draw(turning ? 0 : Math.floor(current.elapsed * 8) % FRAMES.length);
      frameId = requestAnimationFrame(tick);
    }

    function sync() {
      if (disposed) return;
      if (canWalk()) {
        if (frameId === null) {
          previous = 0;
          frameId = requestAnimationFrame(tick);
        }
      } else {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
        previous = 0;
        draw(0);
      }
    }

    function resize() {
      if (!rail || !pet) return;
      maxX = Math.max(0, rail.clientWidth - pet.offsetWidth);
      current.x = Math.max(0, Math.min(maxX, current.x));
      position();
      sync();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(rail);
    resizeObserver.observe(pet);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    visibilityObserver.observe(rail);
    document.addEventListener("visibilitychange", sync);
    image.onload = () => {
      if (disposed) return;
      ready = true;
      setImageFailed(false);
      resize();
      draw(0);
    };
    image.onerror = () => {
      if (disposed) return;
      ready = false;
      setImageFailed(true);
      sync();
    };
    image.src = "/mascot/lifepath-cat-walk.webp";

    return () => {
      disposed = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      image.onload = null;
      image.onerror = null;
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [hidden, paused, greeting]);

  function greet() {
    if (greetingTimer.current !== null) clearTimeout(greetingTimer.current);
    setGreeting(true);
    greetingTimer.current = setTimeout(() => setGreeting(false), 1400);
  }

  return (
    <section className={styles.companion} aria-label="고양이 동행">
      <div className={styles.controls}>
        {!hidden && (
          <Button
            type="button" variant="ghost" size="sm"
            disabled={reducedMotion || imageFailed}
            aria-pressed={paused}
            onClick={() => savePreference(paused ? "walking" : "paused")}
          >
            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {reducedMotion ? "동작 줄임" : paused ? "다시 걷기" : "멈추기"}
          </Button>
        )}
        <Button
          type="button" variant="ghost" size="sm"
          aria-pressed={hidden}
          onClick={() => savePreference(hidden ? "walking" : "hidden")}
        >
          {hidden ? <Cat aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          {hidden ? "고양이 보이기" : "숨기기"}
        </Button>
      </div>
      <div ref={railRef} className={styles.rail} hidden={hidden}>
          <button
            ref={petRef} type="button" className={styles.pet}
            aria-label="고양이에게 인사하기" onClick={greet} hidden={imageFailed}
          >
            <canvas ref={canvasRef} width={480} height={282} aria-hidden="true" />
            {greeting && <span className={styles.bubble}>야옹! 같이 가요.</span>}
          </button>
        {imageFailed && <p className={styles.message}>고양이를 불러오지 못했어요. 재무계획은 계속 이용할 수 있어요.</p>}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {hidden ? "고양이를 숨겼습니다." : greeting ? "고양이가 인사합니다. 야옹!" :
          reducedMotion ? "기기의 동작 줄이기 설정에 따라 고양이가 멈춰 있습니다." :
            paused ? "고양이가 멈춰 있습니다." : "고양이가 상단을 걷고 있습니다."}
      </span>
    </section>
  );
}
