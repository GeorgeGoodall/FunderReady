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

    // Flush initial rAF from useEffect + simulate frame at t=0 (start)
    act(() => {
      let cbs = [...rafCallbacks];
      rafCallbacks = [];
      for (const cb of cbs) cb(0);
      // Process chained rAF from the first frame
      cbs = [...rafCallbacks];
      rafCallbacks = [];
      for (const cb of cbs) cb(500);
    });

    // At 500ms of 1000ms, progress=0.5, eased = 1-(0.5)^3 = 0.875, value ≈ 66
    const midValue = result.current;
    expect(midValue).toBeGreaterThan(0);
    expect(midValue).toBeLessThan(75);

    // Simulate frames well past the 1000ms duration
    act(() => {
      for (let i = 0; i < 20; i++) {
        const cbs = [...rafCallbacks];
        rafCallbacks = [];
        for (const cb of cbs) cb(1500);
      }
    });

    expect(result.current).toBe(75);
  });
});
