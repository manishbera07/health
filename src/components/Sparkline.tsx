import { useEffect, useRef } from "react";

interface Props {
  values: (number | null)[];
  color?: string; // CSS color (hsl(...) or var)
  className?: string;
  min?: number;
  max?: number;
  fill?: boolean;
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

    ctx.lineWidth = 1.75 * dpr;
    ctx.strokeStyle = color;
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

    if (fill) {
      ctx.lineTo(w - pad, h - pad);
      ctx.lineTo(pad, h - pad);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, color.replace("hsl(", "hsla(").replace(")", " / 0.18)"));
      grad.addColorStop(1, color.replace("hsl(", "hsla(").replace(")", " / 0)"));
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }, [values, color, min, max, fill]);

  return <canvas ref={ref} className={className} />;
};
