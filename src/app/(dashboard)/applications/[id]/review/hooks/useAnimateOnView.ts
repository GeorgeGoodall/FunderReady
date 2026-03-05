import { useEffect, useRef, useState } from "react";

/**
 * Returns a ref to attach to a DOM element and an `isVisible` boolean
 * that becomes true (and stays true) once the element enters the viewport.
 *
 * @param threshold - Fraction of element visible to trigger (default 0.1)
 */
export function useAnimateOnView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
}
