import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from 0 to `target` over `duration` ms with ease-out.
 * Returns the current animated value (integer).
 *
 * @param target - The final number to count up to
 * @param shouldAnimate - When true, starts from 0 and animates. When false, returns target immediately.
 * @param duration - Animation duration in ms (default 1000)
 */
export function useCountUp(target: number, shouldAnimate: boolean, duration = 1000): number {
  const [value, setValue] = useState(shouldAnimate ? 0 : target);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!shouldAnimate) {
      setValue(target);
      return;
    }

    setValue(0);
    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, shouldAnimate, duration]);

  return value;
}
