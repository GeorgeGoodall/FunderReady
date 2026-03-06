// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DashboardSidebar } from "../DashboardSidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

describe("DashboardSidebar", () => {
  afterEach(cleanup);

  it("renders core navigation items", () => {
    render(<DashboardSidebar isAdmin={false} isOpen={false} onClose={() => {}} />);
    expect(screen.getByText("Applications")).toBeInTheDocument();
    expect(screen.getByText("Funds")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
  });

  it("shows Admin link when isAdmin is true", () => {
    render(<DashboardSidebar isAdmin={true} isOpen={false} onClose={() => {}} />);
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("hides Admin link when isAdmin is false", () => {
    render(<DashboardSidebar isAdmin={false} isOpen={false} onClose={() => {}} />);
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("highlights active item based on pathname", () => {
    render(<DashboardSidebar isAdmin={false} isOpen={false} onClose={() => {}} />);
    const appLink = screen.getByRole("link", { name: /Applications/ });
    expect(appLink.className).toContain("bg-zinc-100");
  });
});
