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
import type { CriteriaSet, Criterion } from "@/lib/schemas/criteria";
import { SortableCriterionCard } from "./criteria/SortableCriterionCard";

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
