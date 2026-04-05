"use client";

import { GripIcon } from "@/components/icons/GripIcon";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Criterion } from "@/lib/schemas/criteria";

interface SortableCriterionCardProps {
  criterion: Criterion;
  index: number;
  canRemove: boolean;
  onUpdate: (updates: Partial<Criterion>) => void;
  onRemove: () => void;
  onAddSubQuestion: () => void;
  onUpdateSubQuestion: (sqIndex: number, value: string) => void;
  onToggleSubQuestionRequired: (sqIndex: number) => void;
  onRemoveSubQuestion: (sqIndex: number) => void;
}

export function SortableCriterionCard({
  criterion,
  index,
  canRemove,
  onUpdate,
  onRemove,
  onAddSubQuestion,
  onUpdateSubQuestion,
  onToggleSubQuestionRequired,
  onRemoveSubQuestion,
}: SortableCriterionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: criterion.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-1.5 cursor-grab touch-none text-zinc-300 hover:text-zinc-500 active:cursor-grabbing dark:text-zinc-600 dark:hover:text-zinc-400"
          aria-label="Drag to reorder"
        >
          <GripIcon />
        </button>

        <span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          {index + 1}
        </span>
        <div className="flex-1 space-y-2">
          <input
            type="text"
            value={criterion.criterion}
            onChange={(e) => onUpdate({ criterion: e.target.value })}
            placeholder="Criterion name"
            className="block w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Weight:</label>
            <input
              type="text"
              value={criterion.weight ?? ""}
              onChange={(e) => onUpdate({ weight: e.target.value || undefined })}
              placeholder="e.g. 25%"
              className="w-20 rounded border border-zinc-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {criterion.sub_questions.length > 0 && (
            <div className="space-y-1.5 pl-2">
              <p className="text-xs font-medium text-zinc-500">Scoring points:</p>
              {criterion.sub_questions.map((sq, sqi) => {
                const sqText = typeof sq === "string" ? sq : sq.text;
                const sqRequired = typeof sq === "string" ? true : sq.required;
                return (
                  <div key={sqi} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={sqText}
                      onChange={(e) => onUpdateSubQuestion(sqi, e.target.value)}
                      className="flex-1 rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => onToggleSubQuestionRequired(sqi)}
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        sqRequired
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {sqRequired ? "Required" : "Optional"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveSubQuestion(sqi)}
                      className="text-xs text-zinc-400 hover:text-red-500"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={onAddSubQuestion}
            className="text-xs text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400"
          >
            + Add scoring point
          </button>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-zinc-400 hover:text-red-500"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
