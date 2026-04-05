export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

interface WordCounterProps {
  text: string;
  min?: number;
  max?: number;
}

export function WordCounter({ text, min, max }: WordCounterProps) {
  const count = wordCount(text);
  if (!min && !max) return null;

  const limit = max ?? 0;
  const ratio = limit > 0 ? count / limit : 0;
  const colour =
    limit > 0 && ratio > 0.95
      ? "text-red-600 dark:text-red-400"
      : limit > 0 && ratio > 0.8
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-500";

  return (
    <span className={`text-xs ${colour}`}>
      {count} words
      {max ? ` / ${max}` : ""}
      {min && count < min ? ` (min ${min})` : ""}
    </span>
  );
}
