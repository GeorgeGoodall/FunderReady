"use client";

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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { QuestionsSet, Question } from "@/lib/schemas/criteria";
import { SortableQuestionCard } from "./questions/SortableQuestionCard";

interface QuestionsPreviewProps {
  questionsSet: QuestionsSet;
  onChange: (updated: QuestionsSet) => void;
  itemLabel?: string;
}

export function validateQuestionsSet(qs: QuestionsSet): string[] {
  const errors: string[] = [];
  if (qs.overall_word_limit !== undefined && qs.overall_word_limit < 1) {
    errors.push("Overall word limit must be greater than 0");
  }
  qs.questions.forEach((q, i) => {
    const label = `Q${i + 1}`;
    if (q.word_count_min !== undefined && q.word_count_min < 1) {
      errors.push(`${label}: Min words must be greater than 0`);
    }
    if (q.word_count_max !== undefined && q.word_count_max < 1) {
      errors.push(`${label}: Max words must be greater than 0`);
    }
    if (q.char_count_max !== undefined && q.char_count_max < 1) {
      errors.push(`${label}: Max chars must be greater than 0`);
    }
    if (q.word_count_min !== undefined && q.word_count_max !== undefined && q.word_count_min > q.word_count_max) {
      errors.push(`${label}: Min words cannot exceed max words`);
    }
  });
  return errors;
}

export function QuestionsPreview({ questionsSet, onChange, itemLabel = "Question" }: QuestionsPreviewProps) {
  const sensors = useSensors(useSensor(PointerSensor));
  const validationErrors = validateQuestionsSet(questionsSet);

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
          className={`w-28 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 dark:bg-zinc-800 dark:text-zinc-100 ${
            questionsSet.overall_word_limit !== undefined && questionsSet.overall_word_limit < 1
              ? "border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-red-600"
              : "border-zinc-300 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-700"
          }`}
        />
        {questionsSet.overall_word_limit !== undefined && questionsSet.overall_word_limit < 1 ? (
          <span className="text-xs text-red-600 dark:text-red-400">Must be greater than 0</span>
        ) : (
          <span className="text-xs text-zinc-500">Leave blank if none</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {questionsSet.questions.length} {itemLabel.toLowerCase()}{questionsSet.questions.length !== 1 ? "s" : ""}
        </h3>
        {questionsSet.questions.length < 30 && (
          <button
            type="button"
            onClick={addQuestion}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            + Add {itemLabel.toLowerCase()}
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

      {questionsSet.questions.length >= 3 && questionsSet.questions.length < 30 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={addQuestion}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            + Add {itemLabel.toLowerCase()}
          </button>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/30 dark:bg-amber-900/10">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Please fix the following:</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-700 dark:text-amber-400">
            {validationErrors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
