"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useCallback, useEffect } from "react";

interface EditField {
  name: string;
  label: string;
  type: "text" | "textarea" | "checkbox";
}

interface AdminActionBarProps {
  entityType: "organisations" | "funds" | "criteria-sets" | "questions-sets";
  entityId: string;
  approved: boolean;
  parentUrl: string;
  editFields?: EditField[];
  initialValues?: Record<string, string | boolean>;
}

type Mode = "idle" | "rejecting" | "editing" | "deleting";

export function AdminActionBar({
  entityType,
  entityId,
  approved,
  parentUrl,
  editFields,
  initialValues,
}: AdminActionBarProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [actionInProgress, setActionInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [editValues, setEditValues] = useState<Record<string, string | boolean>>(
    initialValues ?? {}
  );
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((message: string) => {
    setError(message);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 5000);
  }, []);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  async function apiAction(
    url: string,
    method: string,
    body?: Record<string, unknown>
  ): Promise<boolean> {
    setActionInProgress(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showError(data.error || `Request failed (${res.status})`);
        return false;
      }
      return true;
    } catch {
      showError("Network error");
      return false;
    } finally {
      setActionInProgress(false);
    }
  }

  const baseUrl = `/api/admin/${entityType}/${entityId}`;

  async function handleApprove() {
    const ok = await apiAction(`${baseUrl}/approve`, "PATCH");
    if (ok) router.refresh();
  }

  async function handleReject() {
    const body: Record<string, unknown> = {};
    if (rejectReason.trim()) body.reason = rejectReason.trim();
    const ok = await apiAction(`${baseUrl}/reject`, "PATCH", body);
    if (ok) {
      setRejectReason("");
      setMode("idle");
      router.refresh();
    }
  }

  async function handleEdit() {
    const body: Record<string, unknown> = {};
    for (const field of editFields ?? []) {
      const value = editValues[field.name];
      if (field.type === "checkbox") {
        body[field.name] = !!value;
      } else {
        body[field.name] = typeof value === "string" ? value : "";
      }
    }
    const ok = await apiAction(baseUrl, "PATCH", body);
    if (ok) {
      setMode("idle");
      router.refresh();
    }
  }

  async function handleDelete() {
    const ok = await apiAction(baseUrl, "DELETE");
    if (ok) router.push(parentUrl);
  }

  function handleEditFieldChange(name: string, value: string | boolean) {
    setEditValues((prev) => ({ ...prev, [name]: value }));
  }

  // ---- Render ----

  if (mode === "rejecting") {
    return (
      <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
        <p className="text-sm font-medium text-red-700 dark:text-red-400">
          Reject this item?
        </p>
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Reason (optional)"
          rows={3}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleReject}
            disabled={actionInProgress}
            className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {actionInProgress ? "Rejecting..." : "Confirm Reject"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              setRejectReason("");
            }}
            disabled={actionInProgress}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === "editing" && editFields) {
    return (
      <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Edit
        </p>
        {editFields.map((field) => (
          <div key={field.name}>
            {field.type === "checkbox" ? (
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={!!editValues[field.name]}
                  onChange={(e) =>
                    handleEditFieldChange(field.name, e.target.checked)
                  }
                  className="rounded border-zinc-300 dark:border-zinc-600"
                />
                {field.label}
              </label>
            ) : (
              <>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {field.label}
                </label>
                {field.type === "textarea" ? (
                  <textarea
                    value={(editValues[field.name] as string) ?? ""}
                    onChange={(e) =>
                      handleEditFieldChange(field.name, e.target.value)
                    }
                    rows={3}
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                ) : (
                  <input
                    type="text"
                    value={(editValues[field.name] as string) ?? ""}
                    onChange={(e) =>
                      handleEditFieldChange(field.name, e.target.value)
                    }
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                )}
              </>
            )}
          </div>
        ))}
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleEdit}
            disabled={actionInProgress}
            className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {actionInProgress ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              setEditValues(initialValues ?? {});
            }}
            disabled={actionInProgress}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === "deleting") {
    return (
      <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
        <p className="text-sm font-medium text-red-700 dark:text-red-400">
          Are you sure you want to delete this item? This action cannot be
          undone.
        </p>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={actionInProgress}
            className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {actionInProgress ? "Deleting..." : "Confirm Delete"}
          </button>
          <button
            type="button"
            onClick={() => setMode("idle")}
            disabled={actionInProgress}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // idle mode
  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {!approved && (
          <>
            <button
              type="button"
              onClick={handleApprove}
              disabled={actionInProgress}
              className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {actionInProgress ? "Approving..." : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => setMode("rejecting")}
              disabled={actionInProgress}
              className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}
        {editFields && editFields.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setEditValues(initialValues ?? {});
              setMode("editing");
            }}
            disabled={actionInProgress}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 disabled:opacity-50"
          >
            Edit
          </button>
        )}
        <button
          type="button"
          onClick={() => setMode("deleting")}
          disabled={actionInProgress}
          className="px-3 py-1.5 text-sm rounded-md bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
