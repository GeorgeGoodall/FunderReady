"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`text-xs transition-colors ${
        copied
          ? "text-green-600 dark:text-green-400"
          : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      }`}
      title="Copy to clipboard"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
