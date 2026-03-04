"use client";

import { useState } from "react";
import { GripIcon } from "@/components/icons/GripIcon";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { QuestionsSet, Question } from "@/lib/schemas/criteria";

interface QuestionsPreviewProps {
  questionsSet: QuestionsSet;
  onChange: (updated: QuestionsSet) => void;
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text_long: "Long text",
  text_short: "Short text",
  dropdown: "Dropdown",
  radio: "Radio buttons",
  checkbox: "Checkboxes",
  email: "Email address",
  url: "Website / URL",
  phone: "Phone number",
  number: "Number / Amount",
};

const FIELD_TYPES = ["text_long", "text_short", "dropdown", "radio", "checkbox", "email", "url", "phone", "number"] as const;

export function QuestionsPreview({ questionsSet, onChange }: QuestionsPreviewProps) {
  const sensors = useSensors(useSensor(PointerSensor));

  const updateQuestion = (index: number, updates: Partial<Question>) => {
    const questions = [...questionsSet.questions];
    questions[index] = { ...questions[index], ...updates };
    onChange({ ...questionsSet, questions });
  };

  const removeQuestion = (index: number) => {
    const questions = questionsSet.questions.filter((_, i) => i !== index);
    const reindexed = questions.map((q, i) => ({ ...q, id: `q${i + 1}` }));
    onChange({ ...questionsSet, questions: reindexed });
  };

  const addQuestion = () => {
    const newId = `q${questionsSet.questions.length + 1}`;
    onChange({
      ...questionsSet,
      questions: [
        ...questionsSet.questions,
        { id: newId, question: "" },
      ],
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = questionsSet.questions.findIndex((q) => q.id === active.id);
    const newIndex = questionsSet.questions.findIndex((q) => q.id === over.id);
    onChange({ ...questionsSet, questions: arrayMove(questionsSet.questions, oldIndex, newIndex) });
  };

  return (
    <div className="space-y-4">
      {/* Overall word limit */}
      <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Overall word limit:
        </label>
        <input
          type="number"
          value={questionsSet.overall_word_limit ?? ""}
          onChange={(e) =>
            onChange({
              ...questionsSet,
              overall_word_limit: e.target.value ? parseInt(e.target.value, 10) : undefined,
            })
          }
          placeholder="e.g. 5000"
          className="w-28 rounded border border-zinc-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <span className="text-xs text-zinc-500">Leave blank if none</span>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {questionsSet.questions.length} question{questionsSet.questions.length !== 1 ? "s" : ""}
        </h3>
        {questionsSet.questions.length < 30 && (
          <button
            type="button"
            onClick={addQuestion}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            + Add question
          </button>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={questionsSet.questions.map((q) => q.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {questionsSet.questions.map((question, qi) => (
              <SortableQuestionCard
                key={question.id}
                question={question}
                index={qi}
                canRemove={questionsSet.questions.length > 1}
                onUpdate={(updates) => updateQuestion(qi, updates)}
                onRemove={() => removeQuestion(qi)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableQuestionCard({
  question,
  index,
  canRemove,
  onUpdate,
  onRemove,
}: {
  question: Question;
  index: number;
  canRemove: boolean;
  onUpdate: (updates: Partial<Question>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const fieldType = question.field_type ?? "text_long";
  const hasOptions = fieldType === "dropdown" || fieldType === "radio" || fieldType === "checkbox";
  const [newOption, setNewOption] = useState("");

  const handleFieldTypeChange = (newType: string) => {
    const updates: Partial<Question> = { field_type: newType as Question["field_type"] };
    if (newType !== "dropdown" && newType !== "radio" && newType !== "checkbox") {
      updates.options = undefined;
    }
    if ((newType === "dropdown" || newType === "radio" || newType === "checkbox") && !question.options?.length) {
      updates.options = [];
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
        {/* Drag handle */}
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
          {/* Question text */}
          <textarea
            value={question.question}
            onChange={(e) => onUpdate({ question: e.target.value })}
            placeholder="Question text"
            rows={2}
            className="block w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />

          {/* Field type + word count row */}
          <div className="flex flex-wrap items-center gap-3">
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

            <span className="mx-1 text-zinc-300 dark:text-zinc-700">|</span>

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
              className="w-20 rounded border border-zinc-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
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
              className="w-20 rounded border border-zinc-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />

            <span className="mx-1 text-zinc-300 dark:text-zinc-700">|</span>

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
          </div>

          {/* Options editor for dropdown/radio/checkbox */}
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

          {/* Guidance (collapsible) */}
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

