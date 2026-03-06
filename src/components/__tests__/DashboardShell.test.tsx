// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DashboardShell } from "../DashboardShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signOut: vi.fn() },
  }),
}));

describe("DashboardShell", () => {
  afterEach(cleanup);

  it("renders children", () => {
    render(
      <DashboardShell displayName="Test User" tier="free" isAdmin={false}>
        <div data-testid="child">Hello</div>
      </DashboardShell>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders nav and sidebar", () => {
    render(
      <DashboardShell displayName="Test User" tier="free" isAdmin={false}>
        <div>Content</div>
      </DashboardShell>
    );
    expect(screen.getByText("FunderReady")).toBeInTheDocument();
    expect(screen.getByText("Applications")).toBeInTheDocument();
    expect(screen.getByText("Funds")).toBeInTheDocument();
  });

  it("toggles sidebar open on hamburger click", () => {
    render(
      <DashboardShell displayName="Test User" tier="free" isAdmin={false}>
        <div>Content</div>
      </DashboardShell>
    );
    const hamburger = screen.getByLabelText("Toggle menu");
    fireEvent.click(hamburger);
    // When open, mobile overlay backdrop should appear
    const backdrops = document.querySelectorAll(".fixed.inset-0");
    expect(backdrops.length).toBeGreaterThan(0);
  });

  it("passes isAdmin to sidebar", () => {
    render(
      <DashboardShell displayName="Admin User" tier="pro" isAdmin={true}>
        <div>Content</div>
      </DashboardShell>
    );
    // The sidebar should contain an Admin nav link (href="/admin")
    expect(screen.getByRole("link", { name: /Admin/ })).toBeInTheDocument();
  });
});
