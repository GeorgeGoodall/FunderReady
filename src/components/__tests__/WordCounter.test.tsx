// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("WordCounter", () => {
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

  async function renderCounter(props: { text: string; min?: number; max?: number }) {
    const { WordCounter } = await import("../WordCounter");
    return render(React.createElement(WordCounter, props));
  }

  it("renders nothing when neither min nor max is provided", async () => {
    const { container } = await renderCounter({ text: "hello world" });
    expect(container.firstChild).toBeNull();
  });

  it("shows word count and max when max is provided", async () => {
    await renderCounter({ text: "one two three", max: 10 });
    expect(screen.getByText("3 words / 10")).toBeDefined();
  });

  it("shows min warning when count is below min", async () => {
    await renderCounter({ text: "one two", min: 5 });
    expect(screen.getByText("2 words (min 5)")).toBeDefined();
  });

  it("applies text-red-600 when count is over 95% of max", async () => {
    // 96 words, max 100 → ratio 0.96 > 0.95 → red
    const text = Array(96).fill("word").join(" ");
    await renderCounter({ text, max: 100 });
    const el = screen.getByText(/\d+ words/);
    expect(el.className).toContain("text-red-600");
  });

  it("applies text-amber-600 when count is over 80% and not over 95% of max", async () => {
    // 85 words, max 100 → ratio 0.85 → amber
    const text = Array(85).fill("word").join(" ");
    await renderCounter({ text, max: 100 });
    const el = screen.getByText(/\d+ words/);
    expect(el.className).toContain("text-amber-600");
  });

  it("applies text-zinc-500 when count is under 80% of max", async () => {
    // 3 words, max 100 → ratio 0.03 → neutral
    await renderCounter({ text: "one two three", max: 100 });
    const el = screen.getByText(/\d+ words/);
    expect(el.className).toContain("text-zinc-500");
  });
});
