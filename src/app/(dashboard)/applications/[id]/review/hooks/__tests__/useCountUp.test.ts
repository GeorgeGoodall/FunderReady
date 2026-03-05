// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCountUp } from "../useCountUp";

describe("useCountUp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at 0 when shouldAnimate is true", () => {
    const { result } = renderHook(() => useCountUp(75, true));
    expect(result.current).toBe(0);
  });

  it("returns target immediately when shouldAnimate is false", () => {
    const { result } = renderHook(() => useCountUp(75, false));
    expect(result.current).toBe(75);
  });

  it("reaches the target value after animation completes", () => {
    let rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const { result } = renderHook(() => useCountUp(75, true));

    // Simulate frames well past the 1000ms duration
    act(() => {
      const startTime = 0;
      // Process all queued callbacks with increasing timestamps
      for (let t = 0; t <= 1500; t += 100) {
        const cbs = [...rafCallbacks];
        rafCallbacks = [];
        for (const cb of cbs) cb(startTime + t);
      }
    });

    expect(result.current).toBe(75);
  });
});
