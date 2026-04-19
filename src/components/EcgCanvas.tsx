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
 *
 * PERF FIX: CSS colors are now cached and only re-read on theme change
 * (via MutationObserver on <html> class), instead of every single frame.
 */
export const EcgCanvas = ({
  sample,
  baseline = 2048,
  range = 1500,
  className,
  active = true,
}: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const buffer = useRef<number[]>(Array(SAMPLES).fill(baseline));
  const writeIdx = useRef(0);
  const pendingSample = useRef<number | null>(null);
  const lastRawSample = useRef<number>(baseline);

  const currentMin = useRef<number>(baseline - range);
  const currentMax = useRef<number>(baseline + range);

  // Cached colors — only updated on theme change
  const cachedColors = useRef<{
    ecg: string;
    glow: string;
    grid: string;
    bg: string;
  } | null>(null);

  // Stash latest sample for the next draw frame
  useEffect(() => {
    if (sample !== null) {
      pendingSample.current = sample;
    }
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

    // Read colors from CSS custom properties — called only on init + theme change
    const readColors = () => {
      const styles = getComputedStyle(document.documentElement);
      cachedColors.current = {
        ecg: `hsl(${styles.getPropertyValue("--ecg").trim()})`,
        glow: `hsl(${styles.getPropertyValue("--ecg-glow").trim()})`,
        grid: `hsl(${styles.getPropertyValue("--grid-line").trim()})`,
        bg: `hsl(${styles.getPropertyValue("--card").trim()})`,
      };
    };
    readColors();

    // Watch for theme changes (class toggle on <html>)
    const observer = new MutationObserver(() => {
      // Small delay to let CSS vars update after class toggle
      requestAnimationFrame(readColors);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

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
        if (pendingSample.current !== null) {
          lastRawSample.current = pendingSample.current;
          pendingSample.current = null;
        }
        buffer.current[writeIdx.current] = lastRawSample.current;
        writeIdx.current = (writeIdx.current + 1) % SAMPLES;
      }

      const w = canvas.width;
      const h = canvas.height;

      // Use cached colors (never re-read CSS in hot loop)
      const colors = cachedColors.current;
      if (!colors) return;

      // Clear
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, w, h);
      drawGrid(w, h, colors.grid);

      // --- AUTO SCALING LOGIC ---
      let minVal = Infinity;
      let maxVal = -Infinity;
      for (let i = 0; i < SAMPLES; i++) {
        const v = buffer.current[i];
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }

      // Enforce a minimum range so flatlines/small noise don't zoom in to infinity
      const MIN_RANGE = 400; // raw ADC units
      if (maxVal - minVal < MIN_RANGE) {
        const center = (maxVal + minVal) / 2 || baseline;
        minVal = center - MIN_RANGE / 2;
        maxVal = center + MIN_RANGE / 2;
      } else {
        // Add a little padding to top and bottom
        const pad = (maxVal - minVal) * 0.1;
        minVal -= pad;
        maxVal += pad;
      }

      // Smoothly animate the visual bounds to match new min/max
      currentMin.current += (minVal - currentMin.current) * 0.05;
      currentMax.current += (maxVal - currentMax.current) * 0.05;

      const scaleMin = currentMin.current;
      let scaleRange = currentMax.current - scaleMin;
      if (scaleRange === 0) scaleRange = 1;

      // Sweep gap (the empty trail just ahead of the writer)
      const gapStart = writeIdx.current;
      const gapPixels = Math.floor(w * 0.04);

      // Draw waveform
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = colors.ecg;
      ctx.shadowBlur = 8 * dpr;
      ctx.shadowColor = colors.glow;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      ctx.beginPath();
      let started = false;
      let prevX = 0;
      let prevY = 0;
      
      for (let i = 0; i < SAMPLES; i++) {
        // Start drawing from oldest sample (just after writeIdx) for left-to-right scroll
        const idx = (gapStart + i) % SAMPLES;
        // Skip the gap region
        if (i < gapPixels) continue;
        
        const raw = buffer.current[idx];
        let v = (raw - scaleMin) / scaleRange;
        v = Math.max(0, Math.min(1, v)); // clamp
        
        const x = (i / SAMPLES) * w;
        const y = h - v * h;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
          prevX = x;
          prevY = y;
        } else {
          // Calculate midpoint for smooth curve
          const xc = (prevX + x) / 2;
          const yc = (prevY + y) / 2;
          ctx.quadraticCurveTo(prevX, prevY, xc, yc);
          prevX = x;
          prevY = y;
        }
      }
      ctx.lineTo(prevX, prevY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw sweep cursor
      const cursorX = (gapPixels / SAMPLES) * w;
      let cursorV = (lastRawSample.current - scaleMin) / scaleRange;
      cursorV = Math.max(0, Math.min(1, cursorV));
      
      ctx.fillStyle = colors.ecg;
      ctx.beginPath();
      ctx.arc(cursorX, h - cursorV * h, 3 * dpr, 0, Math.PI * 2);
      ctx.fill();
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      observer.disconnect();
    };
  }, [active, baseline, range]);

  return <canvas ref={canvasRef} className={className} />;
};
