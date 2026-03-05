// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAnimateOnView } from "../useAnimateOnView";

let observerCallback: IntersectionObserverCallback;
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    vi.fn((cb: IntersectionObserverCallback) => {
      observerCallback = cb;
      return { observe: mockObserve, unobserve: vi.fn(), disconnect: mockDisconnect };
    })
  );
  mockObserve.mockClear();
  mockDisconnect.mockClear();
});

describe("useAnimateOnView", () => {
  it("returns isVisible false initially", () => {
    const { result } = renderHook(() => useAnimateOnView());
    expect(result.current.isVisible).toBe(false);
  });

  it("returns a ref object", () => {
    const { result } = renderHook(() => useAnimateOnView());
    expect(result.current.ref).toBeDefined();
  });
});
