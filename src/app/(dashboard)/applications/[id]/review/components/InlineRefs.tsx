"use client";

import { ReferenceTag } from "./ReferenceTag";

export function InlineRefs({
  text,
  questionMap,
  criteriaMap,
}: {
  text: string;
  questionMap: Map<string, string>;
  criteriaMap: Map<string, string>;
}) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const pattern = /\b([qc])(\d+)\b/g;
  while ((match = pattern.exec(text)) !== null) {
    const [full, prefix, num] = match;
    const id = `${prefix}${num}`;
    const isQuestion = prefix === "q";
    const map = isQuestion ? questionMap : criteriaMap;
    if (map.has(id) || map.size === 0) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      parts.push(
        <ReferenceTag
          key={`${id}-${match.index}`}
          id={id}
          type={isQuestion ? "question" : "criteria"}
          fullText={map.get(id)}
        />
      );
      lastIndex = match.index + full.length;
    }
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return <>{parts}</>;
}
