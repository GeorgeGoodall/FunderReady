// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BreadcrumbProvider, Breadcrumbs, BreadcrumbLabels } from "../Breadcrumbs";

// Mock next/navigation
const mockPathname = vi.fn(() => "/dashboard");
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

describe("Breadcrumbs", () => {
  afterEach(cleanup);
  it("renders nothing on root dashboard page", () => {
    mockPathname.mockReturnValue("/dashboard");
    const { container } = render(
      <BreadcrumbProvider>
        <Breadcrumbs />
      </BreadcrumbProvider>
    );
    expect(container.querySelector("nav")).toBeNull();
  });

  it("renders nothing on root funds page", () => {
    mockPathname.mockReturnValue("/funds");
    const { container } = render(
      <BreadcrumbProvider>
        <Breadcrumbs />
      </BreadcrumbProvider>
    );
    expect(container.querySelector("nav")).toBeNull();
  });

  it("renders breadcrumbs with dynamic label", async () => {
    mockPathname.mockReturnValue("/applications/abc123/review");
    render(
      <BreadcrumbProvider>
        <BreadcrumbLabels labels={{ abc123: "My Grant App" }} />
        <Breadcrumbs />
      </BreadcrumbProvider>
    );
    expect(screen.getByText("Applications")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("My Grant App")).toBeInTheDocument();
    });
  });

  it("falls back to segment value when no label registered", () => {
    mockPathname.mockReturnValue("/applications/abc123");
    render(
      <BreadcrumbProvider>
        <Breadcrumbs />
      </BreadcrumbProvider>
    );
    expect(screen.getByText("Applications")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
  });

  it("renders links for non-terminal segments", async () => {
    mockPathname.mockReturnValue("/applications/abc123/review");
    render(
      <BreadcrumbProvider>
        <BreadcrumbLabels labels={{ abc123: "My Grant App" }} />
        <Breadcrumbs />
      </BreadcrumbProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "My Grant App" })).toHaveAttribute(
        "href",
        "/applications/abc123"
      );
    });
    const appLink = screen.getByRole("link", { name: "Applications" });
    expect(appLink).toHaveAttribute("href", "/dashboard");
  });

  it("renders fund detail breadcrumbs", async () => {
    mockPathname.mockReturnValue("/funds/def456/questions-sets/new");
    render(
      <BreadcrumbProvider>
        <BreadcrumbLabels labels={{ def456: "UKRI Grant" }} />
        <Breadcrumbs />
      </BreadcrumbProvider>
    );
    expect(screen.getByText("Funds")).toBeInTheDocument();
    expect(screen.getByText("Question Sets")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("UKRI Grant")).toBeInTheDocument();
    });
  });
});
