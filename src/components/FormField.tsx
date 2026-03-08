"use client";

import { CopyButton } from "./CopyButton";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

interface Question {
  id: string;
  question: string;
  word_count_min?: number;
  word_count_max?: number;
  guidance?: string;
  field_type?: string;
  options?: string[];
  char_count_max?: number;
  required?: boolean;
  section?: string;
}

interface FormFieldProps {
  question: Question;
  questionNumber?: number;
  value: string;
  selectedOptions?: string[];
  lastReviewedText?: string | null;
  isDisabled?: boolean;
  onChange: (value: string) => void;
  onOptionsChange?: (options: string[]) => void;
  onDisabledChange?: (disabled: boolean) => void;
  onBlur: () => void;
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function WordCounter({ text, min, max }: { text: string; min?: number; max?: number }) {
  const count = wordCount(text);
  if (!min && !max) return null;

  const limit = max ?? 0;
  const ratio = limit > 0 ? count / limit : 0;
  const colour =
    limit > 0 && ratio > 0.95
      ? "text-red-600 dark:text-red-400"
      : limit > 0 && ratio > 0.8
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-500";

  return (
    <span className={`text-xs ${colour}`}>
      {count} words
      {max ? ` / ${max}` : ""}
      {min && count < min ? ` (min ${min})` : ""}
    </span>
  );
}

function CharCounter({ text, max }: { text: string; max: number }) {
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

export function FormField({
  question,
  questionNumber,
  value,
  selectedOptions,
  lastReviewedText,
  isDisabled = false,
  onChange,
  onOptionsChange,
  onDisabledChange,
  onBlur,
}: FormFieldProps) {
  const fieldType = question.field_type ?? "text_long";
  const isOutdated =
    !isDisabled &&
    lastReviewedText !== null &&
    lastReviewedText !== undefined &&
    value !== lastReviewedText;

  return (
    <div className={`rounded-lg border p-5 dark:bg-zinc-900 ${isDisabled ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 opacity-75" : "border-zinc-200 bg-white dark:border-zinc-800"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <label className={`block text-sm font-semibold ${isDisabled ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-900 dark:text-zinc-100"}`}>
            {questionNumber != null && `${questionNumber}. `}{question.question}
            {question.required !== false && !isDisabled && (
              <span className="ml-1 text-red-500">*</span>
            )}
          </label>
          {question.guidance && !isDisabled && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {question.guidance}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDisabled && (
            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
              N/A
            </span>
          )}
          {isOutdated && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Changed since review
            </span>
          )}
          {value.trim() && !isDisabled && <CopyButton text={value} />}
          {onDisabledChange && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={isDisabled}
                onChange={(e) => onDisabledChange(e.target.checked)}
                className="rounded text-zinc-500 focus:ring-zinc-400"
              />
              N/A
            </label>
          )}
        </div>
      </div>

      <div className={`mt-3 ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
        {fieldType === "text_short" && (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            maxLength={question.char_count_max ? Math.floor(question.char_count_max * 1.5) : undefined}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
        )}

        {fieldType === "email" && (
          <input
            type="email"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
        )}

        {fieldType === "url" && (
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder="https://"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
        )}

        {fieldType === "phone" && (
          <input
            type="tel"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
        )}

        {fieldType === "number" && (
          <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
        )}

        {fieldType === "date" && (
          <DatePicker
            selected={value ? new Date(value + "T00:00:00") : null}
            onChange={(date: Date | null) => {
              if (!date) { onChange(""); return; }
              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, "0");
              const d = String(date.getDate()).padStart(2, "0");
              onChange(`${y}-${m}-${d}`);
            }}
            onBlur={onBlur}
            dateFormat="dd/MM/yyyy"
            placeholderText="Select a date"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            wrapperClassName="w-full"
          />
        )}

        {fieldType === "time" && (
          <DatePicker
            selected={(() => {
              if (!value) return null;
              const [h, m] = value.split(":").map(Number);
              const d = new Date();
              d.setHours(h, m, 0, 0);
              return d;
            })()}
            onChange={(date: Date | null) => {
              if (!date) { onChange(""); return; }
              const h = String(date.getHours()).padStart(2, "0");
              const m = String(date.getMinutes()).padStart(2, "0");
              onChange(`${h}:${m}`);
            }}
            onBlur={onBlur}
            showTimeSelect
            showTimeSelectOnly
            timeIntervals={15}
            timeCaption="Time"
            dateFormat="HH:mm"
            timeFormat="HH:mm"
            placeholderText="Select a time"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            wrapperClassName="w-full"
          />
        )}

        {fieldType === "text_long" && (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            rows={Math.max(4, Math.min(12, Math.ceil(value.length / 80)))}
            maxLength={question.char_count_max ? Math.floor(question.char_count_max * 1.5) : undefined}
            className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
        )}

        {fieldType === "dropdown" && question.options && (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">Select an option...</option>
            {question.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        )}

        {fieldType === "radio" && question.options && (
          <div className="space-y-2">
            {question.options.map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`q-${question.id}`}
                  value={opt}
                  checked={value === opt}
                  onChange={(e) => onChange(e.target.value)}
                  onBlur={onBlur}
                  className="text-blue-600 focus:ring-blue-500"
                />
                {opt}
              </label>
            ))}
          </div>
        )}

        {fieldType === "checkbox" && question.options && (
          <div className="space-y-2">
            {question.options.map((opt) => {
              const checked = (selectedOptions ?? []).includes(opt);
              return (
                <label key={opt} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const current = selectedOptions ?? [];
                      const updated = checked
                        ? current.filter((o) => o !== opt)
                        : [...current, opt];
                      onOptionsChange?.(updated);
                    }}
                    onBlur={onBlur}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  {opt}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Word counter for text fields — hidden when disabled */}
      {!isDisabled && (fieldType === "text_long" || fieldType === "text_short") && (
        <div className="mt-1.5 flex items-center justify-between">
          <WordCounter
            text={value}
            min={question.word_count_min}
            max={question.word_count_max}
          />
          {question.char_count_max && (
            <CharCounter text={value} max={question.char_count_max} />
          )}
        </div>
      )}
    </div>
  );
}
