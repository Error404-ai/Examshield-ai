/**
 * ScanCanvas
 * A point-mesh face that follows the cursor. Turn it far enough and the
 * overlay flips from "Face detected" to "Looking away", the same check
 * the real proctoring runs. Pure canvas: no extra dependencies.
 * Respects prefers-reduced-motion (draws one still frame).
 */

import React, { useEffect, useRef } from "react";

interface Pt {
  x: number;
  y: number;
  z: number; // depth 0..1, drives parallax
  kind: "outline" | "feature" | "fill";
}

const seeded = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

function buildFace(): { pts: Pt[]; edges: [number, number][] } {
  const pts: Pt[] = [];
  const rnd = seeded(7);

  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    pts.push({ x: 0.62 * Math.cos(t), y: 0.82 * Math.sin(t), z: 0.1, kind: "outline" });
  }
  const eye = (cx: number) => {
    for (let i = 0; i < 10; i++) {
      const t = (i / 10) * Math.PI * 2;
      pts.push({ x: cx + 0.14 * Math.cos(t), y: -0.18 + 0.055 * Math.sin(t), z: 0.6, kind: "feature" });
    }
  };
  eye(-0.25);
  eye(0.25);
  for (let i = 0; i < 5; i++) {
    const u = i / 4;
    const lift = -0.33 - 0.03 * Math.sin(u * Math.PI);
    pts.push({ x: -0.4 + 0.3 * u, y: lift, z: 0.5, kind: "feature" });
    pts.push({ x: 0.1 + 0.3 * u, y: lift, z: 0.5, kind: "feature" });
  }
  for (let i = 0; i < 6; i++) pts.push({ x: 0, y: -0.1 + i * 0.06, z: 0.9, kind: "feature" });
  pts.push({ x: -0.09, y: 0.24, z: 0.85, kind: "feature" }, { x: 0.09, y: 0.24, z: 0.85, kind: "feature" });
  for (let i = 0; i < 12; i++) {
    const u = i / 11;
    pts.push({ x: -0.2 + 0.4 * u, y: 0.45 + 0.04 * Math.sin(u * Math.PI), z: 0.6, kind: "feature" });
  }
  let n = 0;
  while (n < 70) {
    const x = (rnd() * 2 - 1) * 0.58;
    const y = (rnd() * 2 - 1) * 0.78;
    if ((x * x) / (0.58 * 0.58) + (y * y) / (0.78 * 0.78) <= 1) {
      pts.push({ x, y, z: 0.2 + rnd() * 0.5, kind: "fill" });
      n++;
    }
  }

  const edges: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < 0.2) edges.push([i, j]);
    }
  }
  return { pts, edges };
}

const CYAN = "34,211,238";
const AMBER = "245,158,11";
const AWAY_AT = 0.55;

export const ScanCanvas: React.FC<{ className?: string }> = ({ className }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { pts, edges } = buildFace();
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let still = motionPreference.matches;

    let w = 0;
    let h = 0;
    let raf = 0;
    let mx = 0;
    let my = 0;
    let yaw = 0;
    let pitch = 0;
    let lastMove = -1e9;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth * 0.4)));
      my = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight * 0.4)));
      lastMove = performance.now();
    };

    const draw = (t: number) => {
      const idle = t - lastMove > 3000;
      const tx = still ? 0 : idle ? Math.sin(t * 0.0005) * 0.85 : mx;
      const ty = still ? 0 : idle ? 0 : my;
      yaw += (tx - yaw) * 0.08;
      pitch += (ty - pitch) * 0.08;

      ctx.clearRect(0, 0, w, h);
      const scale = Math.min(h * 0.4, w * 0.36);
      const cx = w / 2 + yaw * scale * 0.12;
      const cy = h / 2 + pitch * scale * 0.06;
      const away = Math.abs(yaw) > AWAY_AT;
      const scanY = still ? 2 : ((t * 0.0004) % 2) * 1.0 - 1.0 + 0.0; // sweeps -1 .. 1

      const sx = pts.map((p) => cx + (p.x + yaw * 0.22 * p.z) * scale);
      const sy = pts.map((p) => cy + (p.y + pitch * 0.1 * p.z) * scale);

      ctx.lineWidth = 1;
      for (const [i, j] of edges) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        ctx.strokeStyle = `rgba(${CYAN},${(1 - d / 0.2) * 0.28})`;
        ctx.beginPath();
        ctx.moveTo(sx[i], sy[i]);
        ctx.lineTo(sx[j], sy[j]);
        ctx.stroke();
      }

      pts.forEach((p, i) => {
        const glow = Math.max(0, 1 - Math.abs(p.y - scanY) / 0.14);
        const base = p.kind === "feature" ? 0.95 : p.kind === "outline" ? 0.55 : 0.35;
        const rgb = p.kind === "fill" ? "167,139,250" : CYAN;
        ctx.fillStyle = `rgba(${rgb},${Math.min(1, base + glow)})`;
        ctx.beginPath();
        ctx.arc(sx[i], sy[i], (p.kind === "feature" ? 1.9 : 1.4) + glow * 1.6, 0, Math.PI * 2);
        ctx.fill();
      });

      if (!still) {
        const ly = cy + scanY * scale * 0.85;
        const g = ctx.createLinearGradient(cx - scale * 0.8, 0, cx + scale * 0.8, 0);
        g.addColorStop(0, `rgba(${CYAN},0)`);
        g.addColorStop(0.5, `rgba(${CYAN},0.55)`);
        g.addColorStop(1, `rgba(${CYAN},0)`);
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx - scale * 0.8, ly);
        ctx.lineTo(cx + scale * 0.8, ly);
        ctx.stroke();
      }

      // Detection box + status, the same states the real check reports
      const col = away ? AMBER : CYAN;
      const bx = cx - scale * 0.78;
      const by = cy - scale * 0.98;
      const bw = scale * 1.56;
      const bh = scale * 1.96;
      const L = 18;
      ctx.strokeStyle = `rgba(${col},0.9)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ([[bx, by, 1, 1], [bx + bw, by, -1, 1], [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]] as const).forEach(
        ([x, y, dx, dy]) => {
          ctx.moveTo(x + dx * L, y);
          ctx.lineTo(x, y);
          ctx.lineTo(x, y + dy * L);
        }
      );
      ctx.stroke();

      ctx.font = "12px 'JetBrains Mono', monospace";
      ctx.fillStyle = `rgba(${col},1)`;
      ctx.fillText(away ? "Looking away: flagged if it lasts" : "1 face detected", bx, by - 10);
      ctx.fillStyle = "rgba(148,163,184,0.9)";
      ctx.fillText("Runs in this browser. Nothing is uploaded.", bx, by + bh + 22);

      if (!still) raf = requestAnimationFrame(draw);
    };

    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      still = event.matches;
      cancelAnimationFrame(raf);
      if (still) draw(0);
      else raf = requestAnimationFrame(draw);
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (still) draw(0);
    });
    ro.observe(canvas);
    window.addEventListener("pointermove", onMove, { passive: true });
    motionPreference.addEventListener("change", onMotionPreferenceChange);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      motionPreference.removeEventListener("change", onMotionPreferenceChange);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={className}
      role="img"
      aria-label="Animated face mesh showing on-device face detection"
    />
  );
};