import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock DNS lookup for SSRF validation
vi.mock("dns/promises", () => ({
  lookup: vi.fn().mockResolvedValue({ address: "93.184.216.34", family: 4 }),
}));

const mockPdfBuffer = Buffer.from("fake-pdf-bytes");

vi.mock("pdf-parse", () => ({
  PDFParse: class MockPDFParse {
    getText = vi.fn().mockResolvedValue({ text: "Extracted PDF text", pages: [], total: 1 });
  },
}));

import { scrapeUrl } from "../scrape-url";

const SIMPLE_HTML = `
<!DOCTYPE html>
<html><head><title>Test Fund</title></head>
<body>
  <nav><a href="/home">Home</a></nav>
  <article>
    <h1>Grant Criteria</h1>
    <p>Applicants must demonstrate clear need for funding.</p>
    <p>Projects should deliver measurable outcomes.</p>
    <a href="/eligibility">Eligibility Requirements</a>
    <a href="/scoring">How We Score Applications</a>
    <a href="https://external.com/other">External Link</a>
    <a href="/logo.png">Download Logo</a>
  </article>
  <footer><a href="/privacy">Privacy</a></footer>
</body></html>
`;

describe("scrapeUrl", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("extracts readable text content from HTML", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => SIMPLE_HTML,
    });

    const result = await scrapeUrl("https://example.com/grants");

    expect(result.content).toContain("clear need for funding");
    expect(result.content).toContain("measurable outcomes");
    expect(result.url).toBe("https://example.com/grants");
  });

  it("extracts links with context from same domain", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => SIMPLE_HTML,
    });

    const result = await scrapeUrl("https://example.com/grants");

    // Should include same-domain links (normalized with trailing slash)
    const hrefs = result.links.map((l) => l.url);
    expect(hrefs).toContain("https://example.com/eligibility/");
    expect(hrefs).toContain("https://example.com/scoring/");

    // Should exclude external domain links
    expect(hrefs).not.toContain("https://external.com/other/");

    // Should exclude non-content links (images)
    const hasImage = result.links.some((l) => l.url.endsWith(".png"));
    expect(hasImage).toBe(false);

    // Each link should have text and context
    const eligLink = result.links.find((l) => l.url.includes("eligibility/"));
    expect(eligLink?.text).toBe("Eligibility Requirements");
    expect(eligLink?.context).toBeTruthy();
  });

  it("throws on HTTP error responses", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => "Not found",
    });

    await expect(scrapeUrl("https://example.com/missing")).rejects.toThrow(
      /404/
    );
  });

  it("extracts text from PDF responses", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/pdf" }),
      arrayBuffer: async () => mockPdfBuffer.buffer.slice(mockPdfBuffer.byteOffset, mockPdfBuffer.byteOffset + mockPdfBuffer.byteLength),
    });

    const result = await scrapeUrl("https://example.com/doc.pdf");

    expect(result.content).toBe("Extracted PDF text");
    expect(result.links).toEqual([]);
    expect(result.url).toBe("https://example.com/doc.pdf");
  });

  it("returns empty content for pages with no readable text", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () =>
        "<!DOCTYPE html><html><head><title>App</title></head><body><script>loadApp()</script></body></html>",
    });

    const result = await scrapeUrl("https://example.com/spa");
    expect(result.content.trim()).toBe("");
  });

  it("throws on unsupported content types", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => "{}",
    });

    await expect(scrapeUrl("https://example.com/api")).rejects.toThrow(
      /Unsupported content type/
    );
  });
});

describe("SSRF protection", () => {
  it("blocks localhost URLs", async () => {
    await expect(scrapeUrl("https://localhost/admin")).rejects.toThrow(/not a public hostname/);
  });

  it("blocks 127.0.0.1 URLs", async () => {
    await expect(scrapeUrl("https://127.0.0.1/admin")).rejects.toThrow(/not a public hostname/);
  });

  it("blocks non-HTTP protocols", async () => {
    await expect(scrapeUrl("file:///etc/passwd")).rejects.toThrow(/unsupported protocol/);
  });

  it("blocks URLs resolving to private IPs", async () => {
    const { lookup } = await import("dns/promises");
    const mockLookup = vi.mocked(lookup);
    mockLookup.mockResolvedValueOnce({ address: "192.168.1.1", family: 4 });

    await expect(scrapeUrl("https://internal.example.com/secret")).rejects.toThrow(/private IP/);
  });

  it("blocks cloud metadata endpoint IPs", async () => {
    const { lookup } = await import("dns/promises");
    const mockLookup = vi.mocked(lookup);
    mockLookup.mockResolvedValueOnce({ address: "169.254.169.254", family: 4 });

    await expect(scrapeUrl("https://metadata.example.com/latest")).rejects.toThrow(/private IP/);
  });
});
