"use client";

import Link from "next/link";
import { useState } from "react";
import type { Json } from "@/types/database";

type Organisation = {
  id: string;
  name: string;
  url: string | null;
};

type CriteriaSetRow = {
  id: string;
  label: string | null;
  name: string;
  description: string | null;
  criteria_json: Json;
  created_at: string;
};

type QuestionsSetRow = {
  id: string;
  label: string | null;
  questions_json: Json;
  overall_word_limit: number | null;
  created_at: string;
};

type Criterion = {
  id: string;
  criterion: string;
  weight?: string;
  sub_questions?: Array<string | { text: string; required: boolean }>;
};

type Question = {
  id: string;
  question: string;
  field_type?: string;
  word_count_min?: number;
  word_count_max?: number;
  guidance?: string;
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB");
}

function parseCriteria(json: Json): Criterion[] {
  if (
    json &&
    typeof json === "object" &&
    !Array.isArray(json) &&
    "criteria" in json
  ) {
    return (json as { criteria: Criterion[] }).criteria ?? [];
  }
  if (Array.isArray(json)) return json as Criterion[];
  return [];
}

function parseQuestions(json: Json): Question[] {
  if (
    json &&
    typeof json === "object" &&
    !Array.isArray(json) &&
    "questions" in json
  ) {
    return (json as { questions: Question[] }).questions ?? [];
  }
  if (Array.isArray(json)) return json as Question[];
  return [];
}

function OlderSets({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <button
        onClick={() => setShow((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <svg
          className={`h-3.5 w-3.5 transition-transform ${show ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        {label}
      </button>
      {show && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}

function QuestionsSetCard({ qs }: { qs: QuestionsSetRow }) {
  const questions = parseQuestions(qs.questions_json);
  return (
    <details className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="flex cursor-pointer items-center justify-between gap-2 p-4">
        <div className="min-w-0">
          <span className="font-medium">{qs.label || "Untitled"}</span>
          <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">
            {questions.length} {questions.length === 1 ? "question" : "questions"}
            {qs.overall_word_limit != null && (
              <> &middot; {qs.overall_word_limit} word limit</>
            )}
          </span>
        </div>
        <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
          {formatDate(qs.created_at)}
        </span>
      </summary>
      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {questions.map((q) => (
            <li key={q.id}>
              <span>{q.question}</span>
              <span className="ml-1 text-xs text-zinc-400 dark:text-zinc-500">
                {q.field_type && `(${q.field_type.replace("_", " ")})`}
                {q.word_count_min != null &&
                  q.word_count_max != null &&
                  ` ${q.word_count_min}–${q.word_count_max} words`}
                {q.word_count_min != null &&
                  q.word_count_max == null &&
                  ` min ${q.word_count_min} words`}
                {q.word_count_min == null &&
                  q.word_count_max != null &&
                  ` max ${q.word_count_max} words`}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

function CriteriaSetCard({ cs }: { cs: CriteriaSetRow }) {
  const criteria = parseCriteria(cs.criteria_json);
  return (
    <details className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="flex cursor-pointer items-center justify-between gap-2 p-4">
        <div className="min-w-0">
          <span className="font-medium">{cs.name || cs.label || "Untitled"}</span>
          <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">
            {criteria.length} {criteria.length === 1 ? "criterion" : "criteria"}
          </span>
        </div>
        <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
          {formatDate(cs.created_at)}
        </span>
      </summary>
      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <ul className="space-y-3 text-sm">
          {criteria.map((c) => (
            <li key={c.id}>
              <div className="flex items-start gap-2">
                <span className="font-medium">{c.criterion}</span>
                {c.weight && (
                  <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {c.weight}
                  </span>
                )}
              </div>
              {c.sub_questions && c.sub_questions.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-zinc-500 dark:text-zinc-400">
                  {c.sub_questions.map((sq, i) => (
                    <li key={i}>{typeof sq === "string" ? sq : sq.text}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

export function FundDetailClient({
  fund,
  organisation,
  criteriaSets,
  questionsSets,
  applicationCount,
  reviewCount,
}: {
  fund: {
    id: string;
    name: string;
    url: string | null;
    notes: string | null;
    published: boolean;
    created_at: string;
  };
  organisation: Organisation | null;
  criteriaSets: CriteriaSetRow[];
  questionsSets: QuestionsSetRow[];
  applicationCount: number;
  reviewCount: number;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      {/* Back link */}
      <Link
        href="/funds"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5 8.25 12l7.5-7.5"
          />
        </svg>
        Back to Funds
      </Link>

      {/* Fund header */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{fund.name}</h1>
            {organisation && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {organisation.url ? (
                  <a
                    href={organisation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {organisation.name}
                  </a>
                ) : (
                  organisation.name
                )}
              </p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              fund.published
                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {fund.published ? "Published" : "Unpublished"}
          </span>
        </div>

        {fund.url && (
          <a
            href={fund.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            {fund.url}
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
        )}

        {fund.notes && (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            {fund.notes}
          </p>
        )}

        <div className="mt-4 flex gap-4 text-sm text-zinc-500 dark:text-zinc-400">
          <span>
            {applicationCount} {applicationCount === 1 ? "application" : "applications"}
          </span>
          <span aria-hidden="true">&middot;</span>
          <span>
            {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
          </span>
        </div>
      </div>

      {/* Questions Sets */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          Questions Sets
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {questionsSets.length}
          </span>
        </h2>

        {questionsSets.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No approved questions sets yet.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {questionsSets.slice(0, 1).map((qs) => (
              <QuestionsSetCard key={qs.id} qs={qs} />
            ))}
            {questionsSets.length > 1 && (
              <OlderSets
                label={`${questionsSets.length - 1} older questions ${questionsSets.length === 2 ? "set" : "sets"}`}
              >
                {questionsSets.slice(1).map((qs) => (
                  <QuestionsSetCard key={qs.id} qs={qs} />
                ))}
              </OlderSets>
            )}
          </div>
        )}
      </section>

      {/* Criteria Sets */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          Criteria Sets
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {criteriaSets.length}
          </span>
        </h2>

        {criteriaSets.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No approved criteria sets yet.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {criteriaSets.slice(0, 1).map((cs) => (
              <CriteriaSetCard key={cs.id} cs={cs} />
            ))}
            {criteriaSets.length > 1 && (
              <OlderSets
                label={`${criteriaSets.length - 1} older criteria ${criteriaSets.length === 2 ? "set" : "sets"}`}
              >
                {criteriaSets.slice(1).map((cs) => (
                  <CriteriaSetCard key={cs.id} cs={cs} />
                ))}
              </OlderSets>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
