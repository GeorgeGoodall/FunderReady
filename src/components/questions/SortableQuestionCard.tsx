"use client";

import { useState } from "react";
import { GripIcon } from "@/components/icons/GripIcon";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Question } from "@/lib/schemas/criteria";

const FIELD_TYPE_LABELS: Record<string, string> = {
  text_long: "Long text",
  text_short: "Short text",
  dropdown: "Dropdown",
  radio: "Radio buttons",
  checkbox: "Checkboxes",
  radio_other: "Radio (with Other)",
  checkbox_other: "Checkboxes (with Other)",
  email: "Email address",
  url: "Website / URL",
  phone: "Phone number",
  number: "Number / Amount",
  date: "Date",
  time: "Time",
};

const FIELD_TYPES = ["text_long", "text_short", "dropdown", "radio", "checkbox", "radio_other", "checkbox_other", "email", "url", "phone", "number", "date", "time"] as const;

interface SortableQuestionCardProps {
  question: Question;
  index: number;
  canRemove: boolean;
  onUpdate: (updates: Partial<Question>) => void;
  onRemove: () => void;
}

export function SortableQuestionCard({
  question,
  index,
  canRemove,
  onUpdate,
  onRemove,
}: SortableQuestionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const fieldType = question.field_type ?? "text_long";
  const hasOptions = fieldType === "dropdown" || fieldType === "radio" || fieldType === "checkbox" || fieldType === "radio_other" || fieldType === "checkbox_other";
  const isSelectionType = hasOptions;
  const isSingleValueType = fieldType === "email" || fieldType === "url" || fieldType === "phone" || fieldType === "number" || fieldType === "date" || fieldType === "time";
  const showWordCount = !isSelectionType && !isSingleValueType;
  const showCharCount = !isSelectionType && !isSingleValueType;
  const [newOption, setNewOption] = useState("");

  const handleFieldTypeChange = (newType: string) => {
    const updates: Partial<Question> = { field_type: newType as Question["field_type"] };
    const newIsSelection = newType === "dropdown" || newType === "radio" || newType === "checkbox" || newType === "radio_other" || newType === "checkbox_other";
    const newIsSingleValue = newType === "email" || newType === "url" || newType === "phone" || newType === "number" || newType === "date" || newType === "time";
    if (!newIsSelection) {
      updates.options = undefined;
    }
    if (newIsSelection && !question.options?.length) {
      updates.options = [];
    }
    if (newIsSelection || newIsSingleValue) {
      updates.word_count_min = undefined;
      updates.word_count_max = undefined;
    }
    if (newIsSelection || newIsSingleValue) {
      updates.char_count_max = undefined;
    }
    onUpdate(updates);
  };

  const addOption = () => {
    if (!newOption.trim()) return;
    onUpdate({ options: [...(question.options ?? []), newOption.trim()] });
    setNewOption("");
  };

  const removeOption = (optIndex: number) => {
    onUpdate({ options: (question.options ?? []).filter((_, i) => i !== optIndex) });
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

        <span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
          {index + 1}
        </span>
        <div className="flex-1 space-y-2">
          <textarea
            value={question.question}
            onChange={(e) => onUpdate({ question: e.target.value })}
            placeholder="Question text"
            rows={2}
            className="block w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />

          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1">
              <label className="text-xs text-zinc-500">Type:</label>
              <select
                value={fieldType}
                onChange={(e) => handleFieldTypeChange(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {FIELD_TYPE_LABELS[ft]}
                  </option>
                ))}
              </select>
            </span>

            {showWordCount && (
              <>
                <span className="text-zinc-300 dark:text-zinc-700">|</span>
                <span className="flex items-center gap-1">
                  <label className="text-xs text-zinc-500">Words:</label>
                  <input
                    type="number"
                    value={question.word_count_min ?? ""}
                    onChange={(e) =>
                      onUpdate({
                        word_count_min: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      })
                    }
                    placeholder="Min"
                    title={question.word_count_min !== undefined && question.word_count_min < 1 ? "Must be greater than 0" : ""}
                    className={`w-20 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 dark:bg-zinc-800 dark:text-zinc-100 ${
                      question.word_count_min !== undefined && question.word_count_min < 1
                        ? "border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-red-600"
                        : "border-zinc-300 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-700"
                    }`}
                  />
                  <span className="text-xs text-zinc-400">to</span>
                  <input
                    type="number"
                    value={question.word_count_max ?? ""}
                    onChange={(e) =>
                      onUpdate({
                        word_count_max: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      })
                    }
                    placeholder="Max"
                    title={question.word_count_max !== undefined && question.word_count_max < 1 ? "Must be greater than 0" : ""}
                    className={`w-20 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 dark:bg-zinc-800 dark:text-zinc-100 ${
                      question.word_count_max !== undefined && question.word_count_max < 1
                        ? "border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-red-600"
                        : "border-zinc-300 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-700"
                    }`}
                  />
                </span>
              </>
            )}

            {showCharCount && (
              <>
                <span className="text-zinc-300 dark:text-zinc-700">|</span>
                <span className="flex items-center gap-1">
                  <label className="text-xs text-zinc-500">Chars:</label>
                  <input
                    type="number"
                    value={question.char_count_max ?? ""}
                    onChange={(e) =>
                      onUpdate({
                        char_count_max: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      })
                    }
                    placeholder="Max"
                    title={question.char_count_max !== undefined && question.char_count_max < 1 ? "Must be greater than 0" : ""}
                    className={`w-20 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 dark:bg-zinc-800 dark:text-zinc-100 ${
                      question.char_count_max !== undefined && question.char_count_max < 1
                        ? "border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-red-600"
                        : "border-zinc-300 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-700"
                    }`}
                  />
                </span>
              </>
            )}

            <span className="text-zinc-300 dark:text-zinc-700">|</span>
            <span className="flex items-center gap-1">
              <label className="text-xs text-zinc-500">Priority:</label>
              <select
                value={question.priority ?? ""}
                onChange={(e) =>
                  onUpdate({
                    priority: e.target.value ? parseInt(e.target.value, 10) : undefined,
                  })
                }
                className="rounded border border-zinc-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">—</option>
                <option value="1">1 (Low)</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5 (High)</option>
              </select>
            </span>
          </div>

          {hasOptions && (
            <div className="rounded border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Options
              </label>
              {(question.options ?? []).length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {(question.options ?? []).map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <span className="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800">
                        {opt}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeOption(oi)}
                        className="text-xs text-zinc-400 hover:text-red-500"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addOption();
                    }
                  }}
                  placeholder="Add an option..."
                  className="flex-1 rounded border border-zinc-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={addOption}
                  disabled={!newOption.trim()}
                  className="rounded bg-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                >
                  Add
                </button>
              </div>
            </div>
          )}
          {(fieldType === "radio_other" || fieldType === "checkbox_other") && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              An &ldquo;Other (please specify)&rdquo; option will be appended automatically.
            </p>
          )}

          {question.guidance !== undefined && (
            <div>
              <label className="text-xs text-zinc-500">Guidance:</label>
              <textarea
                value={question.guidance ?? ""}
                onChange={(e) =>
                  onUpdate({ guidance: e.target.value || undefined })
                }
                rows={2}
                placeholder="Funder guidance for this question"
                className="mt-1 block w-full rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          )}

          {question.guidance === undefined && (
            <button
              type="button"
              onClick={() => onUpdate({ guidance: "" })}
              className="text-xs text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400"
            >
              + Add guidance
            </button>
          )}
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
