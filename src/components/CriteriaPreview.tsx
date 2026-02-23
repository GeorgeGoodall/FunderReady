"use client";

import type { CriteriaSet, Criterion } from "@/lib/schemas/criteria";

interface CriteriaPreviewProps {
  criteriaSet: CriteriaSet;
  onChange: (updated: CriteriaSet) => void;
}

export function CriteriaPreview({ criteriaSet, onChange }: CriteriaPreviewProps) {
  const updateCriterion = (index: number, updates: Partial<Criterion>) => {
    const criteria = [...criteriaSet.criteria];
    criteria[index] = { ...criteria[index], ...updates };
    onChange({ ...criteriaSet, criteria });
  };

  const removeCriterion = (index: number) => {
    const criteria = criteriaSet.criteria.filter((_, i) => i !== index);
    // Re-assign sequential IDs
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
      sub_questions: [...criterion.sub_questions, ""],
    });
  };

  const updateSubQuestion = (criterionIndex: number, sqIndex: number, value: string) => {
    const criterion = criteriaSet.criteria[criterionIndex];
    const sub_questions = [...criterion.sub_questions];
    sub_questions[sqIndex] = value;
    updateCriterion(criterionIndex, { sub_questions });
  };

  const removeSubQuestion = (criterionIndex: number, sqIndex: number) => {
    const criterion = criteriaSet.criteria[criterionIndex];
    const sub_questions = criterion.sub_questions.filter((_, i) => i !== sqIndex);
    updateCriterion(criterionIndex, { sub_questions });
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

      <div className="space-y-3">
        {criteriaSet.criteria.map((criterion, ci) => (
          <div
            key={criterion.id}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-start gap-3">
              <span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                {ci + 1}
              </span>
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={criterion.criterion}
                  onChange={(e) => updateCriterion(ci, { criterion: e.target.value })}
                  placeholder="Criterion name"
                  className="block w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-zinc-500">Weight:</label>
                  <input
                    type="text"
                    value={criterion.weight ?? ""}
                    onChange={(e) => updateCriterion(ci, { weight: e.target.value || undefined })}
                    placeholder="e.g. 25%"
                    className="w-20 rounded border border-zinc-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>

                {criterion.sub_questions.length > 0 && (
                  <div className="space-y-1.5 pl-2">
                    <p className="text-xs font-medium text-zinc-500">Sub-questions:</p>
                    {criterion.sub_questions.map((sq, sqi) => (
                      <div key={sqi} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={sq}
                          onChange={(e) => updateSubQuestion(ci, sqi, e.target.value)}
                          className="flex-1 rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                        <button
                          type="button"
                          onClick={() => removeSubQuestion(ci, sqi)}
                          className="text-xs text-zinc-400 hover:text-red-500"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => addSubQuestion(ci)}
                  className="text-xs text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  + Add sub-question
                </button>
              </div>
              {criteriaSet.criteria.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCriterion(ci)}
                  className="text-xs text-zinc-400 hover:text-red-500"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
