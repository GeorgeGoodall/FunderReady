// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

const LS_KEY = "new-application-intro-dismissed";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Silence fetch — tests below don't need real network calls
global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });

describe("NewApplicationForm — guidance intro panel", () => {
  let React: typeof import("react");
  let render: typeof import("@testing-library/react").render;
  let cleanup: typeof import("@testing-library/react").cleanup;
  let screen: typeof import("@testing-library/react").screen;
  let fireEvent: typeof import("@testing-library/react").fireEvent;

  const defaultProps = {
    tier: "pro" as const,
    usage: {
      allowed: true,
      remaining: 10,
      resetDate: new Date("2026-05-01"),
    },
    isAdmin: false,
  };

  beforeEach(async () => {
    vi.resetModules();
    React = await import("react");
    const rtl = await import("@testing-library/react");
    render = rtl.render;
    cleanup = rtl.cleanup;
    screen = rtl.screen;
    fireEvent = rtl.fireEvent;
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  async function renderForm(props = defaultProps) {
    const { NewApplicationForm } = await import("../NewApplicationForm");
    return render(React.createElement(NewApplicationForm, props));
  }

  it("shows the intro panel on first visit (no localStorage key)", async () => {
    await renderForm();
    expect(screen.getByText("What you'll need")).toBeInTheDocument();
  });

  it("hides the intro panel after dismiss", async () => {
    await renderForm();
    fireEvent.click(screen.getByRole("button", { name: /got it/i }));
    expect(screen.queryByText("What you'll need")).not.toBeInTheDocument();
  });

  it("writes localStorage key on dismiss", async () => {
    await renderForm();
    fireEvent.click(screen.getByRole("button", { name: /got it/i }));
    expect(localStorage.getItem(LS_KEY)).toBe("true");
  });

  it("does not show intro when already dismissed", async () => {
    localStorage.setItem(LS_KEY, "true");
    await renderForm();
    expect(screen.queryByText("What you'll need")).not.toBeInTheDocument();
  });

  it("reopens intro panel when ? button is clicked", async () => {
    localStorage.setItem(LS_KEY, "true");
    await renderForm();
    fireEvent.click(screen.getByRole("button", { name: /show help/i }));
    expect(screen.getByText("What you'll need")).toBeInTheDocument();
  });

  it("does not rewrite localStorage when ? button reopens the panel", async () => {
    localStorage.setItem(LS_KEY, "true");
    await renderForm();
    fireEvent.click(screen.getByRole("button", { name: /show help/i }));
    // localStorage key should still be 'true' — reopen does not clear it
    expect(localStorage.getItem(LS_KEY)).toBe("true");
  });
});
