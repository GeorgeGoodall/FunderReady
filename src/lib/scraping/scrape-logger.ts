import { mkdirSync } from "fs";
import { appendFile } from "fs/promises";
import { join } from "path";

export interface ScrapeLogger {
  log(category: string, message: string, data?: Record<string, unknown>): void;
  getLogPath(): string;
}

export function createScrapeLogger(startUrl: string): ScrapeLogger {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const domain = new URL(startUrl).hostname.replace(/\./g, "_");
  const filename = `scrape-${domain}-${timestamp}.log`;

  const logsDir = join(process.cwd(), "logs");
  try {
    mkdirSync(logsDir, { recursive: true });
  } catch {
    // directory may already exist
  }

  const logPath = join(logsDir, filename);

  // Buffer writes to avoid blocking the event loop on every log call
  let writeQueue = Promise.resolve();

  function log(
    category: string,
    message: string,
    data?: Record<string, unknown>
  ) {
    const time = new Date().toISOString();
    const prefix = `[${time}] [${category}]`;
    const line = data
      ? `${prefix} ${message} ${JSON.stringify(data, null, 2)}`
      : `${prefix} ${message}`;

    // Console
    console.log(line);

    // Async file write — chained to preserve ordering
    writeQueue = writeQueue.then(() =>
      appendFile(logPath, line + "\n").catch(() => {
        // Don't crash if file write fails
      })
    );
  }

  // Write header
  log("INIT", `Scrape session started for: ${startUrl}`);
  log("INIT", `Log file: ${logPath}`);

  return { log, getLogPath: () => logPath };
}
