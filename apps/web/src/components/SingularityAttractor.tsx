import { useEffect, useRef } from "react";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";

interface SingularityAttractorProps {
  className?: string;
  variant?: "hero" | "crest";
  active?: boolean;
}

/**
 * Generative Clifford strange attractor rendered as a luminous celestial point field.
 *
 * Uses a low-overhead 2D canvas with DPR scaling, 30fps cap, visibility pause, and
 * full `prefers-reduced-motion` support (renders a single crisp static frame).
 */
export function SingularityAttractor({
  className,
  variant = "hero",
  active = true,
}: SingularityAttractorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- drives imperative 2D canvas animation loop and DPR resize synchronization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const pointCount = variant === "hero" ? 6400 : 1100;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let rafId: number | null = null;
    let lastFrameTime = 0;
    let phase = 0.42;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawFrame = (t: number) => {
      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = variant === "hero" ? height * 0.48 : height * 0.54;
      const scale =
        variant === "hero"
          ? Math.min(width, height) * 0.255
          : Math.min(width * 0.34, height * 0.48);

      // Subtle radial horizon aura behind the attractor core
      const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 1.9);
      if (variant === "hero") {
        aura.addColorStop(0, "rgba(143, 174, 255, 0.14)");
        aura.addColorStop(0.42, "rgba(96, 132, 224, 0.055)");
        aura.addColorStop(1, "rgba(5, 6, 8, 0)");
      } else {
        aura.addColorStop(0, "rgba(143, 174, 255, 0.08)");
        aura.addColorStop(0.55, "rgba(72, 104, 184, 0.025)");
        aura.addColorStop(1, "rgba(3, 4, 6, 0)");
      }
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, width, height);

      // Clifford attractor parameters with ultra-slow organic drift
      const a = -1.72 + Math.sin(t * 0.23) * 0.07;
      const b = 1.62 + Math.cos(t * 0.19) * 0.06;
      const c = 1.18 + Math.sin(t * 0.15 + 1.1) * 0.05;
      const d = -0.78 + Math.cos(t * 0.17 + 0.6) * 0.06;

      let x = 0.1;
      let y = 0.1;

      ctx.globalCompositeOperation = "lighter";

      // Warm up the orbit so initial transients settle onto the manifold
      for (let i = 0; i < 40; i++) {
        const nx = Math.sin(a * y) + c * Math.cos(a * x);
        const ny = Math.sin(b * x) + d * Math.cos(b * y);
        x = nx;
        y = ny;
      }

      const cosR = Math.cos(t * 0.06);
      const sinR = Math.sin(t * 0.06);
      const baseAlpha = variant === "hero" ? 0.36 : 0.14;
      const dotSize = variant === "hero" ? 1.3 : 0.9;

      for (let i = 0; i < pointCount; i++) {
        const nx = Math.sin(a * y) + c * Math.cos(a * x);
        const ny = Math.sin(b * x) + d * Math.cos(b * y);
        x = nx;
        y = ny;

        const rx = x * cosR - y * sinR;
        const ry = x * sinR + y * cosR;
        const px = cx + rx * scale;
        const py = cy + ry * scale;

        if (px < -2 || px > width + 2 || py < -2 || py > height + 2) continue;

        const dist = Math.hypot(rx, ry);
        if (i % 6 === 0) {
          ctx.fillStyle = `rgba(232, 240, 255, ${(baseAlpha * 1.25).toFixed(3)})`;
        } else if (dist < 1.15) {
          ctx.fillStyle = `rgba(143, 174, 255, ${(baseAlpha * 1.05).toFixed(3)})`;
        } else {
          ctx.fillStyle = `rgba(116, 152, 242, ${(baseAlpha * 0.72).toFixed(3)})`;
        }
        ctx.fillRect(px, py, dotSize, dotSize);
      }

      // Precision hairline orbital reticle for subtle sci-fi instrument grounding
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle =
        variant === "hero" ? "rgba(198, 216, 255, 0.095)" : "rgba(198, 216, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, scale * 1.38, 0, Math.PI * 2);
      ctx.stroke();

      if (variant === "hero") {
        ctx.strokeStyle = "rgba(143, 174, 255, 0.15)";
        ctx.beginPath();
        ctx.arc(cx, cy, scale * 0.92, -0.4 + t * 0.04, 1.3 + t * 0.04);
        ctx.stroke();

        ctx.strokeStyle = "rgba(220, 232, 255, 0.07)";
        ctx.beginPath();
        ctx.arc(cx, cy, scale * 1.66, 2.1 - t * 0.025, 3.6 - t * 0.025);
        ctx.stroke();
      }
    };

    resize();
    drawFrame(phase);

    const stopObserving = observeResize(canvas, () => {
      resize();
      drawFrame(phase);
    });

    if (reducedMotion || !active) {
      return () => {
        stopObserving();
      };
    }

    const tick = (now: number) => {
      if (document.visibilityState === "visible" && now - lastFrameTime >= 33) {
        lastFrameTime = now;
        phase += 0.012;
        drawFrame(phase);
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      stopObserving();
    };
  }, [variant, active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("pointer-events-none select-none", className)}
    />
  );
}
