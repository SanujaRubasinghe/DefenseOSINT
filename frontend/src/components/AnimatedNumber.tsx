import { useEffect, useRef, useState } from "react";

const TWEEN_MS = 600;

/**
 * Tweens between two backend-reported values so a confidence change reads as a
 * transition rather than a jump. It never extrapolates — it only animates
 * between numbers the backend actually returned.
 */
export default function AnimatedNumber({
  value,
  decimals = 2,
}: {
  value: number;
  decimals?: number;
}) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      fromRef.current = value;
      setShown(value);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / TWEEN_MS);
      // ease-out so the number settles rather than stopping dead
      const eased = 1 - (1 - p) * (1 - p);
      setShown(from + (value - from) * eased);
      if (p < 1) {
        raf = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{shown.toFixed(decimals)}</>;
}
