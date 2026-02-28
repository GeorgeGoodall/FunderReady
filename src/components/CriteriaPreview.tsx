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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CriteriaSet, Criterion } from "@/lib/schemas/criteria";

interface CriteriaPreviewProps {
  criteriaSet: CriteriaSet;
  onChange: (updated: CriteriaSet) => void;
}

export function CriteriaPreview({ criteriaSet, onChange }: CriteriaPreviewProps) {
  const sensors = useSensors(useSensor(PointerSensor));

  const updateCriterion = (index: number, updates: Partial<Criterion>) => {
    const criteria = [...criteriaSet.criteria];
    criteria[index] = { ...criteria[index], ...updates };
    onChange({ ...criteriaSet, criteria });
  };

  const removeCriterion = (index: number) => {
    const criteria = criteriaSet.criteria.filter((_, i) => i !== index);
    const reindexed = criteria.map((c, i) => ({ ...c, id: `c${i + 1}` }));
    onChange({ ...criteriaSet, criteria: reindexed });
  };

  const addCriterion = () => {
    const newId = `c${criteriaSet.criteria.length + 1}`;
    onChange({
      ...criteriaSet,
      criteria: [
        ...criteriaSet.criteria,
        { id: newId, criterion: "", sub_questions: [] },
      ],
    });
  };

  const addSubQuestion = (criterionIndex: number) => {
    const criterion = criteriaSet.criteria[criterionIndex];
    updateCriterion(criterionIndex, {
      sub_questions: [...criterion.sub_questions, { text: "", required: true }],
    });
  };

  const updateSubQuestion = (criterionIndex: number, sqIndex: number, value: string) => {
    const criterion = criteriaSet.criteria[criterionIndex];
    const sub_questions = [...criterion.sub_questions];
    const existing = sub_questions[sqIndex];
    sub_questions[sqIndex] = { text: value, required: typeof existing === "object" && "required" in existing ? existing.required : true };
    updateCriterion(criterionIndex, { sub_questions });
  };

  const toggleSubQuestionRequired = (criterionIndex: number, sqIndex: number) => {
    const criterion = criteriaSet.criteria[criterionIndex];
    const sub_questions = [...criterion.sub_questions];
    const existing = sub_questions[sqIndex];
    const text = typeof existing === "string" ? existing : existing.text;
    const required = typeof existing === "string" ? true : existing.required;
    sub_questions[sqIndex] = { text, required: !required };
    updateCriterion(criterionIndex, { sub_questions });
  };

  const removeSubQuestion = (criterionIndex: number, sqIndex: number) => {
    const criterion = criteriaSet.criteria[criterionIndex];
    const sub_questions = criterion.sub_questions.filter((_, i) => i !== sqIndex);
    updateCriterion(criterionIndex, { sub_questions });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = criteriaSet.criteria.findIndex((c) => c.id === active.id);
    const newIndex = criteriaSet.criteria.findIndex((c) => c.id === over.id);
    onChange({ ...criteriaSet, criteria: arrayMove(criteriaSet.criteria, oldIndex, newIndex) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {criteriaSet.criteria.length} criteria extracted
        </h3>
        {criteriaSet.criteria.length < 20 && (
          <button
            type="button"
            onClick={addCriterion}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            + Add criterion
          </button>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={criteriaSet.criteria.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {criteriaSet.criteria.map((criterion, ci) => (
              <SortableCriterionCard
                key={criterion.id}
                criterion={criterion}
                index={ci}
                canRemove={criteriaSet.criteria.length > 1}
                onUpdate={(updates) => updateCriterion(ci, updates)}
                onRemove={() => removeCriterion(ci)}
                onAddSubQuestion={() => addSubQuestion(ci)}
                onUpdateSubQuestion={(sqi, val) => updateSubQuestion(ci, sqi, val)}
                onToggleSubQuestionRequired={(sqi) => toggleSubQuestionRequired(ci, sqi)}
                onRemoveSubQuestion={(sqi) => removeSubQuestion(ci, sqi)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableCriterionCard({
  criterion,
  index,
  canRemove,
  onUpdate,
  onRemove,
  onAddSubQuestion,
  onUpdateSubQuestion,
  onToggleSubQuestionRequired,
  onRemoveSubQuestion,
}: {
  criterion: Criterion;
  index: number;
  canRemove: boolean;
  onUpdate: (updates: Partial<Criterion>) => void;
  onRemove: () => void;
  onAddSubQuestion: () => void;
  onUpdateSubQuestion: (sqIndex: number, value: string) => void;
  onToggleSubQuestionRequired: (sqIndex: number) => void;
  onRemoveSubQuestion: (sqIndex: number) => void;
}) {
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
              <p className="text-xs font-medium text-zinc-500">Sub-questions:</p>
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
            + Add sub-question
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

function GripIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="4" cy="2.5" r="1.2" />
      <circle cx="10" cy="2.5" r="1.2" />
      <circle cx="4" cy="7" r="1.2" />
      <circle cx="10" cy="7" r="1.2" />
      <circle cx="4" cy="11.5" r="1.2" />
      <circle cx="10" cy="11.5" r="1.2" />
    </svg>
  );
}
