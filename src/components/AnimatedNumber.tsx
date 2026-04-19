import { useEffect, useRef, useState } from "react";

interface Props {
  value: number | null;
  digits?: number;
  duration?: number;
  className?: string;
}

/** Animated count-up number. Snaps when value becomes null. */
export const AnimatedNumber = ({ value, digits = 0, duration = 400, className }: Props) => {
  const [display, setDisplay] = useState<number | null>(value);
  const fromRef = useRef<number>(value ?? 0);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (value === null) {
      setDisplay(null);
      return;
    }
    const from = fromRef.current ?? value;
    const to = value;
    const start = performance.now();
    startRef.current = start;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  if (display === null) return <span className={className}>—</span>;
  return <span className={className}>{display.toFixed(digits)}</span>;
};
