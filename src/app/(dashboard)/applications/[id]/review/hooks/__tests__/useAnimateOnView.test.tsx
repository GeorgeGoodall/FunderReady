// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import React from "react";
import { useAnimateOnView } from "../useAnimateOnView";

let observerCallback: IntersectionObserverCallback | null = null;
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

beforeEach(() => {
  observerCallback = null;
  vi.stubGlobal(
    "IntersectionObserver",
    vi.fn(function (this: unknown, cb: IntersectionObserverCallback) {
      observerCallback = cb;
      return { observe: mockObserve, unobserve: vi.fn(), disconnect: mockDisconnect };
    })
  );
  mockObserve.mockClear();
  mockDisconnect.mockClear();
});

function TestComponent() {
  const { ref, isVisible } = useAnimateOnView();
  return <div ref={ref} data-testid="target">{isVisible ? "visible" : "hidden"}</div>;
}

describe("useAnimateOnView", () => {
  it("returns isVisible false initially", () => {
    const { result } = renderHook(() => useAnimateOnView());
    expect(result.current.isVisible).toBe(false);
  });

  it("returns a ref object", () => {
    const { result } = renderHook(() => useAnimateOnView());
    expect(result.current.ref).toBeDefined();
  });

  it("sets isVisible to true when element intersects viewport", () => {
    render(<TestComponent />);

    expect(screen.getByTestId("target").textContent).toBe("hidden");
    expect(mockObserve).toHaveBeenCalled();

    // Simulate the element entering the viewport
    act(() => {
      observerCallback!(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(screen.getByTestId("target").textContent).toBe("visible");
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
