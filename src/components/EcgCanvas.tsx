import { useEffect, useRef } from "react";

interface Props {
  /** Latest ECG sample. New value pushes one column. Pass null to push baseline. */
  sample: number | null;
  /** Center of expected ECG range (ESP32 raw ADC). Auto-scales around this. */
  baseline?: number;
  /** Half-range used for normalization. */
  range?: number;
  className?: string;
  active?: boolean;
}

const SAMPLES = 600; // visible window width in samples

/**
 * Smooth scrolling ECG waveform on canvas.
 * Renders new samples on rAF, leaves old samples in place via canvas blit.
 */
export const EcgCanvas = ({
  sample,
  baseline = 2048,
  range = 1500,
  className,
  active = true,
}: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const buffer = useRef<number[]>(Array(SAMPLES).fill(0.5));
  const writeIdx = useRef(0);
  const pendingSample = useRef<number | null>(null);
  const lastSample = useRef<number>(0.5);

  // Stash latest sample for the next draw frame
  useEffect(() => {
    pendingSample.current = sample;
  }, [sample]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const getColors = () => {
      const styles = getComputedStyle(document.documentElement);
      return {
        ecg: `hsl(${styles.getPropertyValue("--ecg").trim()})`,
        glow: `hsl(${styles.getPropertyValue("--ecg-glow").trim()})`,
        grid: `hsl(${styles.getPropertyValue("--grid-line").trim()})`,
        bg: `hsl(${styles.getPropertyValue("--card").trim()})`,
      };
    };

    const drawGrid = (w: number, h: number, gridColor: string) => {
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const stepX = w / 24;
      const stepY = h / 6;
      for (let i = 0; i <= 24; i++) {
        const x = Math.round(i * stepX) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let i = 0; i <= 6; i++) {
        const y = Math.round(i * stepY) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);

      // Push latest sample (or hold last) into ring buffer
      if (active) {
        let s = pendingSample.current;
        if (s === null) {
          s = lastSample.current;
        } else {
          // Normalize from raw ADC to 0..1
          s = Math.max(0, Math.min(1, 0.5 + (s - baseline) / (range * 2)));
          lastSample.current = s;
          pendingSample.current = null;
        }
        buffer.current[writeIdx.current] = s;
        writeIdx.current = (writeIdx.current + 1) % SAMPLES;
      }

      const w = canvas.width;
      const h = canvas.height;
      const { ecg, glow, grid, bg } = getColors();

      // Clear
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      drawGrid(w, h, grid);

      // Sweep gap (the empty trail just ahead of the writer)
      const gapStart = writeIdx.current;
      const gapPixels = Math.floor(w * 0.04);

      // Draw waveform
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = ecg;
      ctx.shadowBlur = 8 * dpr;
      ctx.shadowColor = glow;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      ctx.beginPath();
      let started = false;
      for (let i = 0; i < SAMPLES; i++) {
        // Start drawing from oldest sample (just after writeIdx) for left-to-right scroll
        const idx = (gapStart + i) % SAMPLES;
        // Skip the gap region
        if (i < gapPixels) continue;
        const v = buffer.current[idx];
        const x = (i / SAMPLES) * w;
        const y = h - v * h;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw sweep cursor
      const cursorX = (gapPixels / SAMPLES) * w;
      ctx.fillStyle = ecg;
      ctx.beginPath();
      ctx.arc(cursorX, h - lastSample.current * h, 3 * dpr, 0, Math.PI * 2);
      ctx.fill();
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [active, baseline, range]);

  return <canvas ref={canvasRef} className={className} />;
};
