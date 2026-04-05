interface CharCounterProps {
  text: string;
  max: number;
}

export function CharCounter({ text, max }: CharCounterProps) {
  const count = text.length;
  const ratio = count / max;
  const colour =
    ratio > 1
      ? "text-red-600 dark:text-red-400 font-semibold"
      : ratio > 0.95
        ? "text-red-600 dark:text-red-400"
        : ratio > 0.8
          ? "text-amber-600 dark:text-amber-400"
          : "text-zinc-500";

  return (
    <span className={`text-xs ${colour}`}>
      {count} / {max} chars{count > max ? " (over limit)" : ""}
    </span>
  );
}
