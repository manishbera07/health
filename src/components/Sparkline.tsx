import { useEffect, useRef } from "react";

interface Props {
  values: (number | null)[];
  color?: string; // CSS color — can be a resolved value like "hsl(120 60% 50%)"
  className?: string;
  min?: number;
  max?: number;
  fill?: boolean;
}

/**
 * Resolves a CSS color string for use in Canvas.
 * Canvas cannot process "hsl(var(--x))" — this resolves CSS vars first.
 */
function resolveColor(raw: string): string {
  // If the color doesn't contain "var(", it's already concrete — use as-is
  if (!raw.includes("var(")) return raw;

  // Extract the CSS variable name from "hsl(var(--accent))" → "--accent"
  const match = raw.match(/var\((--[\w-]+)\)/);
  if (!match) return raw;

  const cssVar = match[1];
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(cssVar)
    .trim();

  if (!resolved) return "#888"; // fallback if var not found

  // Rebuild: "hsl(var(--accent))" → "hsl(120 60% 50%)"
  // The outer function (e.g. "hsl(") is preserved, the var() is replaced
  const outer = raw.replace(/var\(--[\w-]+\)/, resolved);
  return outer;
}

/**
 * Tiny sparkline on canvas. Re-renders on values change.
 */
export const Sparkline = ({
  values,
  color = "hsl(var(--primary))",
  className,
  min,
  max,
  fill = true,
}: Props) => {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
      if (valid.length < 2) return;

      const lo = min ?? Math.min(...valid);
      const hi = max ?? Math.max(...valid);
      const span = hi - lo || 1;
      const pad = 2 * dpr;
      const xStep = (w - pad * 2) / (values.length - 1);

      // Resolve CSS vars to concrete color values so Canvas can use them
      const resolvedColor = resolveColor(color);

      ctx.lineWidth = 1.75 * dpr;
      ctx.strokeStyle = resolvedColor;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      ctx.beginPath();
      let started = false;
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v === null || !Number.isFinite(v)) continue;
        const x = pad + i * xStep;
        const y = h - pad - ((v - lo) / span) * (h - pad * 2);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      if (fill && started) {
        ctx.lineTo(w - pad, h - pad);
        ctx.lineTo(pad, h - pad);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, resolvedColor);
        grad.addColorStop(1, resolvedColor);
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }
    } catch (e) {
      console.warn("Sparkline draw error:", e);
    }
  }, [values, color, min, max, fill]);

  return <canvas ref={ref} className={className} />;
};
