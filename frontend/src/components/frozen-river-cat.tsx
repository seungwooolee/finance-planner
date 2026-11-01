"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import styles from "./not-found-screen.module.css";

const motion = () => window.matchMedia("(prefers-reduced-motion: reduce)");
const readMotion = () => motion().matches;
const serverMotion = () => true;
function subscribeMotion(onChange: () => void) {
  const media = motion();
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const FRAMES = [
  [9, 153, 498, 275], [528, 155, 482, 273], [1030, 154, 489, 275],
  [15, 611, 483, 270], [521, 610, 486, 270], [1031, 610, 490, 270],
] as const;

export function FrozenRiverCat() {
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, readMotion, serverMotion);
  const trackRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const movement = useRef({ x: 0, direction: 1, elapsed: 0, positioned: false });

  useEffect(() => {
    const track = trackRef.current;
    const cat = catRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!track || !cat || !canvas || !ctx) return;
    const image = new Image();
    const current = movement.current;
    let disposed = false, ready = false, onScreen = true;
    let maxX = 0, previous = 0, turnUntil = 0;
    let animation: number | null = null;

    function draw(frame: number) {
      if (!ready || disposed || !ctx || !canvas) return;
      const [sx, sy, sw, sh] = FRAMES[frame];
      const scale = 470 / 498;
      const w = sw * scale, h = sh * scale;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      if (current.direction < 0) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(image, sx / 2, sy / 2, sw / 2, sh / 2,
        (canvas.width - w) / 2, canvas.height - h - 3, w, h);
      ctx.restore();
    }

    function position() {
      if (!cat) return;
      cat.style.transform = `translateX(${current.x.toFixed(2)}px)`;
      cat.dataset.direction = current.direction < 0 ? "left" : "right";
    }

    const canWalk = () => ready && !disposed && !paused && !reducedMotion &&
      !document.hidden && onScreen && maxX > 0;

    function tick(now: number) {
      animation = null;
      if (!canWalk()) return;
      const dt = previous ? Math.min((now - previous) / 1000, .05) : 0;
      previous = now;
      const turning = now < turnUntil;
      if (!turning) {
        current.elapsed += dt;
        current.x += current.direction * 48 * dt;
        if (current.x >= maxX) {
          current.x = maxX; current.direction = -1; turnUntil = now + 400;
        } else if (current.x <= 0) {
          current.x = 0; current.direction = 1; turnUntil = now + 400;
        }
      }
      position();
      draw(turning ? 0 : Math.floor(current.elapsed * 8) % FRAMES.length);
      animation = requestAnimationFrame(tick);
    }

    function sync() {
      if (disposed) return;
      if (canWalk()) {
        if (animation === null) { previous = 0; animation = requestAnimationFrame(tick); }
      } else {
        if (animation !== null) cancelAnimationFrame(animation);
        animation = null;
        draw(0);
      }
    }

    function resize() {
      if (!track || !cat) return;
      maxX = Math.max(0, track.clientWidth - cat.offsetWidth);
      if (!current.positioned && maxX > 0) { current.x = maxX * .42; current.positioned = true; }
      current.x = Math.max(0, Math.min(maxX, current.x));
      position();
      sync();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(track);
    resizeObserver.observe(cat);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    visibilityObserver.observe(track);
    document.addEventListener("visibilitychange", sync);
    image.onload = () => { if (!disposed) { ready = true; setFailed(false); resize(); draw(0); } };
    image.onerror = () => { if (!disposed) { ready = false; setFailed(true); sync(); } };
    image.src = "/mascot/lifepath-cat-walk.webp";
    return () => {
      disposed = true;
      if (animation !== null) cancelAnimationFrame(animation);
      image.onload = null; image.onerror = null;
      resizeObserver.disconnect(); visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [paused, reducedMotion]);

  return (
    <>
      <div className={styles.motionControl}>
        <button
          type="button" className={styles.pauseButton} aria-pressed={paused || reducedMotion}
          disabled={reducedMotion || failed} onClick={() => setPaused((value) => !value)}
        >
          {paused || reducedMotion ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
          {reducedMotion ? "동작 줄임" : paused ? "다시 걷기" : "잠깐 쉬기"}
        </button>
      </div>
      <div ref={trackRef} className={styles.catTrack}>
        <div ref={catRef} className={styles.walkingCat} hidden={failed}>
          <canvas ref={canvasRef} width={480} height={282} role="img" aria-label="얼어붙은 한강 위를 걷는 흑백 고양이" />
        </div>
      </div>
    </>
  );
}
