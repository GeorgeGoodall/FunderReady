// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("CharCounter", () => {
  let React: typeof import("react");
  let render: typeof import("@testing-library/react").render;
  let cleanup: typeof import("@testing-library/react").cleanup;
  let screen: typeof import("@testing-library/react").screen;

  beforeEach(async () => {
    React = await import("react");
    const rtl = await import("@testing-library/react");
    render = rtl.render;
    cleanup = rtl.cleanup;
    screen = rtl.screen;
  });

  afterEach(() => cleanup());

  async function renderCounter(props: { text: string; max: number }) {
    const { CharCounter } = await import("../CharCounter");
    return render(React.createElement(CharCounter, props));
  }

  it("shows char count and max", async () => {
    await renderCounter({ text: "hello", max: 100 });
    expect(screen.getByText("5 / 100 chars")).toBeDefined();
  });

  it("shows over limit message when count exceeds max", async () => {
    const text = "a".repeat(101);
    await renderCounter({ text, max: 100 });
    expect(screen.getByText("101 / 100 chars (over limit)")).toBeDefined();
  });

  it("applies text-red-600 font-semibold when over limit", async () => {
    const text = "a".repeat(101);
    await renderCounter({ text, max: 100 });
    const el = screen.getByText(/chars/);
    expect(el.className).toContain("text-red-600");
    expect(el.className).toContain("font-semibold");
  });

  it("applies text-red-600 (not font-semibold) at exactly 95-100% of max", async () => {
    // 96 chars, max 100 → ratio 0.96 → red without font-semibold
    const text = "a".repeat(96);
    await renderCounter({ text, max: 100 });
    const el = screen.getByText(/chars/);
    expect(el.className).toContain("text-red-600");
    expect(el.className).not.toContain("font-semibold");
  });

  it("applies text-amber-600 when over 80% and under 95%", async () => {
    // 85 chars, max 100 → ratio 0.85 → amber
    const text = "a".repeat(85);
    await renderCounter({ text, max: 100 });
    const el = screen.getByText(/chars/);
    expect(el.className).toContain("text-amber-600");
  });

  it("applies text-zinc-500 when under 80%", async () => {
    await renderCounter({ text: "hello", max: 100 });
    const el = screen.getByText(/chars/);
    expect(el.className).toContain("text-zinc-500");
  });
});
