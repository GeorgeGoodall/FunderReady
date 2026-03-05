import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { lookup } from "dns/promises";

export interface LinkWithContext {
  url: string;
  text: string;
  context: string; // ~200 chars of surrounding text
}

export interface ScrapeResult {
  url: string;
  content: string; // Clean markdown text
  links: LinkWithContext[];
}

const SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico",
  ".css", ".js", ".woff", ".woff2", ".ttf", ".eot",
  ".mp3", ".mp4", ".avi", ".mov", ".wmv",
  ".zip", ".tar", ".gz", ".rar",
]);

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * SSRF protection: block private/reserved IP ranges and non-HTTPS schemes.
 * Resolves DNS to prevent DNS rebinding attacks.
 */
export async function validateUrlForSsrf(url: string): Promise<void> {
  const parsed = new URL(url);

  // Only allow http(s) schemes
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Blocked: unsupported protocol "${parsed.protocol}". Only HTTP(S) is allowed.`);
  }

  // Resolve DNS and check for private IPs
  const hostname = parsed.hostname;

  // Block obvious private hostnames
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error(`Blocked: "${hostname}" is not a public hostname.`);
  }

  // Resolve DNS to get actual IP and check for private ranges
  try {
    const { address } = await lookup(hostname);
    if (isPrivateIp(address)) {
      throw new Error(`Blocked: "${hostname}" resolves to a private IP address.`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Blocked:")) throw err;
    throw new Error(`DNS resolution failed for "${hostname}". Please check the URL.`);
  }
}

function isPrivateIp(ip: string): boolean {
  // IPv4 private ranges
  const parts = ip.split(".").map(Number);
  if (parts.length === 4) {
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (link-local / cloud metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0/8
    if (parts[0] === 0) return true;
  }

  // IPv6 loopback and link-local
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc00:") || ip.startsWith("fd00:")) {
    return true;
  }

  return false;
}

function isSkippableUrl(href: string): boolean {
  try {
    const pathname = new URL(href).pathname.toLowerCase();
    // Skip Cloudflare email-protection links
    if (pathname.includes("/cdn-cgi/")) return true;
    return SKIP_EXTENSIONS.has(
      pathname.substring(pathname.lastIndexOf("."))
    );
  } catch {
    return false;
  }
}

/**
 * Normalize a URL for deduplication:
 * - Strip fragment (#...)
 * - Ensure consistent trailing slash on paths (add if no extension)
 * - Lowercase scheme and hostname (already done by URL constructor)
 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    // Add trailing slash to paths without a file extension
    if (!u.pathname.endsWith("/") && !u.pathname.includes(".", u.pathname.lastIndexOf("/"))) {
      u.pathname += "/";
    }
    return u.href;
  } catch {
    return raw;
  }
}

function isSameDomain(baseUrl: string, candidateUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const candidate = new URL(candidateUrl);
    return base.hostname === candidate.hostname;
  } catch {
    return false;
  }
}

function resolveUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function extractSurroundingContext(
  element: Element,
  maxLength = 200
): string {
  const parent = element.closest("p, li, div, section, article, td") ?? element.parentElement;
  if (!parent) return "";
  const text = parent.textContent?.trim() ?? "";
  return text.slice(0, maxLength);
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  // SSRF protection: validate URL before fetching
  await validateUrlForSsrf(url);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/pdf",
    },
  });

  // Check response size to prevent memory exhaustion
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
    throw new Error(`Response too large (${contentLength} bytes). Maximum is ${MAX_RESPONSE_BYTES} bytes.`);
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch URL (${response.status}). Please check the URL is correct and publicly accessible.`
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isPdf =
    contentType.includes("application/pdf") ||
    new URL(url).pathname.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    const arrayBuffer = await response.arrayBuffer();
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse(new Uint8Array(arrayBuffer));
    const result = await parser.getText();
    return { url, content: result.text.trim(), links: [] };
  }

  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error(
      `Unsupported content type: ${contentType}. Expected an HTML page or PDF.`
    );
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;

  // Extract links before Readability modifies the DOM
  const anchors = Array.from(document.querySelectorAll("a[href]"));
  const links: LinkWithContext[] = [];

  for (const anchor of anchors) {
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) {
      continue;
    }

    const resolved = resolveUrl(url, href);
    if (!resolved) continue;
    if (!isSameDomain(url, resolved)) continue;
    if (isSkippableUrl(resolved)) continue;
    const normalized = normalizeUrl(resolved);
    if (normalized === normalizeUrl(url)) continue; // Skip self-links

    links.push({
      url: normalized,
      text: anchor.textContent?.trim() ?? "",
      context: extractSurroundingContext(anchor),
    });
  }

  // Deduplicate links by URL
  const seen = new Set<string>();
  const uniqueLinks = links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });

  // Extract readable content
  const reader = new Readability(document);
  const article = reader.parse();

  let content = "";
  if (article?.content) {
    const turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    content = turndown.turndown(article.content);
  }

  // Replace Cloudflare email-protection placeholders with a note
  content = content.replace(
    /\[email[\s\u00a0]*protected\]/gi,
    `[email protected] (see: ${url})`
  );

  return { url, content, links: uniqueLinks };
}
