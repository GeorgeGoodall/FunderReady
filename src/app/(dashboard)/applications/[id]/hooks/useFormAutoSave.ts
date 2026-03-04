"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Json } from "@/types/database";

interface AnswerData {
  question_id: string;
  answer_text: string;
  selected_options: Json | null;
  last_reviewed_text: string | null;
  is_disabled?: boolean | null;
}

interface Question {
  id: string;
}

export function useFormAutoSave(
  applicationId: string,
  initialAnswers: AnswerData[],
  questions: Question[],
  setError: (msg: string) => void
) {
  const [answerMap, setAnswerMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const a of initialAnswers) {
      map[a.question_id] = a.answer_text;
    }
    return map;
  });

  const [optionsMap, setOptionsMap] = useState<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    for (const a of initialAnswers) {
      if (a.selected_options && Array.isArray(a.selected_options)) {
        map[a.question_id] = a.selected_options as string[];
      }
    }
    return map;
  });

  const [disabledMap, setDisabledMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const a of initialAnswers) {
      if (a.is_disabled) {
        map[a.question_id] = true;
      }
    }
    return map;
  });

  const reviewedTextMap: Record<string, string | null> = {};
  for (const a of initialAnswers) {
    reviewedTextMap[a.question_id] = a.last_reviewed_text;
  }

  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const dirtyRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveAnswers = useCallback(async () => {
    if (!dirtyRef.current) return;

    const answersToSave = questions
      .filter((q) => answerMap[q.id] !== undefined || disabledMap[q.id] !== undefined)
      .map((q) => ({
        question_id: q.id,
        answer_text: answerMap[q.id] ?? "",
        is_disabled: disabledMap[q.id] ?? false,
        ...(optionsMap[q.id] && { selected_options: optionsMap[q.id] }),
      }));

    if (answersToSave.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/answers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: answersToSave }),
      });

      if (res.ok) {
        dirtyRef.current = false;
        setLastSaved(new Date());
        setError("");
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
      }
    } catch {
      setError("Network error saving answers");
    } finally {
      setSaving(false);
    }
  }, [answerMap, optionsMap, disabledMap, applicationId, questions, setError]);

  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => {
      if (dirtyRef.current) {
        saveAnswers();
      }
    }, 30000);
    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
  }, [saveAnswers]);

  const handleChange = (questionId: string, value: string) => {
    setAnswerMap((prev) => ({ ...prev, [questionId]: value }));
    dirtyRef.current = true;
  };

  const handleOptionsChange = (questionId: string, options: string[]) => {
    setOptionsMap((prev) => ({ ...prev, [questionId]: options }));
    dirtyRef.current = true;
  };

  const handleDisabledChange = (questionId: string, disabled: boolean) => {
    setDisabledMap((prev) => ({ ...prev, [questionId]: disabled }));
    dirtyRef.current = true;
  };

  const handleBlur = () => {
    if (dirtyRef.current) {
      saveAnswers();
    }
  };

  return {
    answerMap,
    setAnswerMap,
    optionsMap,
    setOptionsMap,
    disabledMap,
    setDisabledMap,
    reviewedTextMap,
    saving,
    lastSaved,
    dirtyRef,
    saveAnswers,
    handleChange,
    handleOptionsChange,
    handleDisabledChange,
    handleBlur,
  };
}
