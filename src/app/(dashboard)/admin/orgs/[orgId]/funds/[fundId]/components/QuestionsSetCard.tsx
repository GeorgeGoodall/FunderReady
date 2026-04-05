import Link from "next/link";
import { formatDate } from "../../../../../lib/format";
import type { Json } from "@/types/database";

function countJson(json: Json): number {
  if (Array.isArray(json)) return json.length;
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.criteria)) return obj.criteria.length;
    if (Array.isArray(obj.questions)) return obj.questions.length;
  }
  return 0;
}

export interface QuestionsSetRow {
  id: string;
  label: string | null;
  questions_json: Json;
  overall_word_limit: number | null;
  approved: boolean;
  created_at: string;
}

export function QuestionsSetCard({ qs, orgId, fundId }: { qs: QuestionsSetRow; orgId: string; fundId: string }) {
  return (
    <Link
      href={`/admin/orgs/${orgId}/funds/${fundId}/sets/${qs.id}`}
      className="block bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 hover:bg-zinc-50 dark:hover:bg-zinc-750"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {qs.label || "Untitled"}
        </span>
        <span className="text-xs text-zinc-500">
          {countJson(qs.questions_json)} questions
        </span>
        {qs.overall_word_limit && (
          <span className="text-xs text-zinc-500">
            ({qs.overall_word_limit} word limit)
          </span>
        )}
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          qs.approved
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
            : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
        }`}>
          {qs.approved ? "approved" : "pending"}
        </span>
      </div>
      <p className="text-xs text-zinc-400 mt-0.5">{formatDate(qs.created_at)}</p>
    </Link>
  );
}
