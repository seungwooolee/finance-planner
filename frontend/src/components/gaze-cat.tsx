"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import styles from "./login-screen.module.css";

const query = () => window.matchMedia("(prefers-reduced-motion: reduce)");
const readMotion = () => query().matches;
const serverMotion = () => true;
function subscribeMotion(onChange: () => void) {
  const media = query();
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const clamp = (value: number) => Math.max(-1, Math.min(1, value));

export function GazeCat({ lookAway = false }: { lookAway?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gaze = useRef({ x: 0, y: 0 });
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, readMotion, serverMotion);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const image = new Image();
    let ready = false;
    let disposed = false;
    let onScreen = true;
    let frame: number | null = null;
    let previous = 0;
    let target = { x: 0, y: 0 };
    const current = gaze.current;

    // Source coordinates refer to the unchanged 1086×1448 cutout photo.
    // Only the iris interiors are painted; fur, lids, face and body stay intact.
    function eye(x: number, y: number, rx: number, ry: number, angle: number) {
      if (!ctx) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();
      const iris = ctx.createRadialGradient(-3, 3, 2, 0, 0, rx + 2);
      iris.addColorStop(0, "#dfd798");
      iris.addColorStop(0.57, "#cfbf74");
      iris.addColorStop(0.84, "#b09b50");
      iris.addColorStop(1, "#6e633b");
      ctx.fillStyle = iris;
      ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
      const px = current.x * 6.3;
      const py = current.y * 4.5;
      ctx.fillStyle = "#242b29";
      ctx.beginPath();
      ctx.ellipse(px, py - 1, 4.9, 12.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.88)";
      ctx.beginPath();
      ctx.ellipse(px - 3.2, py - 7, 3.4, 2.5, -.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function draw() {
      if (!ready || !canvas || !ctx || disposed) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 400, 1086, 720, 0, 0, 1086, 720);
      eye(187, 249, 16.5, 16.6, -.18);
      eye(301, 252, 18.7, 17.2, .12);
      canvas.dataset.gazeX = current.x.toFixed(3);
      canvas.dataset.gazeY = current.y.toFixed(3);
    }

    function tick(now: number) {
      frame = null;
      if (disposed || !ready || document.hidden || !onScreen) return;
      const dt = previous ? Math.min((now - previous) / 1000, .05) : 1 / 60;
      previous = now;
      const blend = 1 - Math.exp(-dt * 14);
      current.x += (target.x - current.x) * blend;
      current.y += (target.y - current.y) * blend;
      if (Math.abs(current.x - target.x) + Math.abs(current.y - target.y) < .002) {
        current.x = target.x;
        current.y = target.y;
      } else {
        frame = requestAnimationFrame(tick);
      }
      draw();
    }

    function update() {
      if (!canvas || disposed) return;
      if (lookAway) {
        target = { x: -.95, y: -.28 };
      } else if (!reducedMotion && lastPointer.current) {
        const bounds = canvas.getBoundingClientRect();
        const centerX = bounds.left + bounds.width * (244 / 1086);
        const centerY = bounds.top + bounds.height * (251 / 720);
        target = {
          x: clamp((lastPointer.current.x - centerX) / Math.max(160, window.innerWidth * .35)),
          y: clamp((lastPointer.current.y - centerY) / Math.max(140, window.innerHeight * .35)),
        };
      } else {
        target = { x: 0, y: 0 };
      }
      if (!ready) return;
      if (reducedMotion) {
        current.x = target.x;
        current.y = target.y;
        draw();
      } else if (!document.hidden && onScreen && frame === null) {
        previous = 0;
        frame = requestAnimationFrame(tick);
      }
    }

    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        lastPointer.current = null;
      } else {
        lastPointer.current = { x: event.clientX, y: event.clientY };
      }
      update();
    };
    const onLeave = () => { lastPointer.current = null; update(); };
    const onVisibility = () => {
      if (document.hidden && frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      } else if (!document.hidden) update();
    };
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (!onScreen && frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      } else if (onScreen) update();
    });
    observer.observe(canvas);
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(canvas);
    if (!reducedMotion) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerdown", onPointer, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
    }
    document.addEventListener("visibilitychange", onVisibility);
    image.onload = () => {
      if (disposed) return;
      ready = true;
      setFailed(false);
      draw();
      update();
    };
    image.onerror = () => { if (!disposed) setFailed(true); };
    image.src = "/mascot/lifepath-cat-portrait.webp";
    return () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      image.onload = null;
      image.onerror = null;
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [lookAway, reducedMotion]);

  return (
    <div className={styles.catStage}>
      <canvas
        ref={canvasRef} width={1086} height={720} className={styles.cat}
        role="img" aria-label="커서를 바라보는 LifePath 흑백 고양이"
        data-privacy={lookAway ? "true" : "false"} hidden={failed}
      />
      {failed && <p className={styles.catFallback}>고양이가 잠시 쉬고 있어요.</p>}
    </div>
  );
}
