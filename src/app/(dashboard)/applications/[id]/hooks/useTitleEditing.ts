"use client";

import { useState, useRef } from "react";

export function useTitleEditing(applicationId: string, initialTitle: string) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(initialTitle);
  const [savingTitle, setSavingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const handleTitleEdit = () => {
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.select(), 0);
  };

  const handleTitleSave = async () => {
    setEditingTitle(false);
    const trimmed = titleValue.trim();
    if (trimmed === initialTitle) return;
    setSavingTitle(true);
    try {
      await fetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
    } finally {
      setSavingTitle(false);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleTitleSave();
    if (e.key === "Escape") {
      setTitleValue(initialTitle);
      setEditingTitle(false);
    }
  };

  return {
    editingTitle,
    titleValue,
    setTitleValue,
    savingTitle,
    titleInputRef,
    handleTitleEdit,
    handleTitleSave,
    handleTitleKeyDown,
  };
}
