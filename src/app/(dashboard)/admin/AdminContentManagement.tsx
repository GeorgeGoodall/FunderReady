"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CriteriaPreview } from "@/components/CriteriaPreview";
import { QuestionsPreview } from "@/components/QuestionsPreview";
import type { CriteriaSet, QuestionsSet } from "@/lib/schemas/criteria";
import type { Json } from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgWithCounts {
  id: string;
  name: string;
  url: string | null;
  description: string | null;
  approved: boolean;
  created_at: string;
  created_by: string;
  total_funds: number;
  pending_funds: number;
  pending_sets: number;
  pending_total: number;
}

interface FundWithCounts {
  id: string;
  name: string;
  url: string | null;
  notes: string | null;
  published: boolean;
  created_at: string;
  created_by: string;
  organisation_id: string;
  pending_criteria: number;
  pending_questions: number;
  pending_total: number;
}

interface CriteriaSetRow {
  id: string;
  name: string;
  label: string | null;
  description: string | null;
  criteria_json: Json;
  approved: boolean;
  created_at: string;
  created_by: string;
}

interface QuestionsSetRow {
  id: string;
  label: string | null;
  questions_json: Json;
  overall_word_limit: number | null;
  approved: boolean;
  created_at: string;
  created_by: string;
}

interface FundSets {
  criteria_sets: CriteriaSetRow[];
  questions_sets: QuestionsSetRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function truncate(text: string | null, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function countJson(json: Json): number {
  return Array.isArray(json) ? json.length : 0;
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 animate-spin text-zinc-400 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Chevron icon
// ---------------------------------------------------------------------------

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-zinc-400 transition-transform ${expanded ? "rotate-90" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// PendingBadge
// ---------------------------------------------------------------------------

function PendingBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-0.5 rounded-full">
      {count} pending
    </span>
  );
}

function ApprovedBadge() {
  return (
    <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs px-2 py-0.5 rounded-full">
      approved
    </span>
  );
}

function PendingStatusBadge() {
  return (
    <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-0.5 rounded-full">
      pending
    </span>
  );
}

// ---------------------------------------------------------------------------
// Confirm Dialog
// ---------------------------------------------------------------------------

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  loading,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
      <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={onConfirm}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "Deleting..." : "Confirm Delete"}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reject Form
// ---------------------------------------------------------------------------

function RejectForm({
  onSubmit,
  onCancel,
  loading,
}: {
  onSubmit: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
      <label className="block text-sm font-medium text-red-700 dark:text-red-300">
        Rejection reason (optional)
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        className="mt-1 block w-full rounded-md border border-red-300 px-3 py-1.5 text-sm dark:border-red-700 dark:bg-zinc-800 dark:text-zinc-100"
        placeholder="Enter reason for rejection..."
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => onSubmit(reason)}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "Rejecting..." : "Confirm Reject"}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Header
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
        {title} {count !== undefined && `(${count})`}
      </h3>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AdminContentManagement() {
  // State
  const [orgs, setOrgs] = useState<OrgWithCounts[]>([]);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [orgFunds, setOrgFunds] = useState<Record<string, FundWithCounts[]>>({});
  const [expandedFunds, setExpandedFunds] = useState<Set<string>>(new Set());
  const [fundSets, setFundSets] = useState<Record<string, FundSets>>({});
  const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [amendingId, setAmendingId] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Error helper with auto-dismiss
  const showError = useCallback((msg: string) => {
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 5000);
  }, []);

  // Loading helpers
  const addLoading = useCallback((id: string) => {
    setLoading((prev) => new Set(prev).add(id));
  }, []);

  const removeLoading = useCallback((id: string) => {
    setLoading((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchOrgs = useCallback(async () => {
    const res = await fetch("/api/admin/content");
    if (!res.ok) {
      showError("Failed to load organisations");
      return;
    }
    const data: OrgWithCounts[] = await res.json();
    setOrgs(data);
  }, [showError]);

  const fetchOrgFunds = useCallback(
    async (orgId: string) => {
      addLoading(orgId);
      try {
        const res = await fetch(`/api/admin/content/orgs/${orgId}`);
        if (!res.ok) {
          showError("Failed to load funds");
          return;
        }
        const data: FundWithCounts[] = await res.json();
        setOrgFunds((prev) => ({ ...prev, [orgId]: data }));
      } finally {
        removeLoading(orgId);
      }
    },
    [addLoading, removeLoading, showError]
  );

  const fetchFundSets = useCallback(
    async (fundId: string) => {
      addLoading(fundId);
      try {
        const res = await fetch(`/api/admin/content/funds/${fundId}`);
        if (!res.ok) {
          showError("Failed to load sets");
          return;
        }
        const data: FundSets = await res.json();
        setFundSets((prev) => ({ ...prev, [fundId]: data }));
      } finally {
        removeLoading(fundId);
      }
    },
    [addLoading, removeLoading, showError]
  );

  // Initial load
  useEffect(() => {
    fetchOrgs().finally(() => setInitialLoading(false));
  }, [fetchOrgs]);

  // ---------------------------------------------------------------------------
  // Toggle expand helpers
  // ---------------------------------------------------------------------------

  const toggleOrg = (orgId: string) => {
    setExpandedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) {
        next.delete(orgId);
      } else {
        next.add(orgId);
        if (!orgFunds[orgId]) fetchOrgFunds(orgId);
      }
      return next;
    });
  };

  const toggleFund = (fundId: string) => {
    setExpandedFunds((prev) => {
      const next = new Set(prev);
      if (next.has(fundId)) {
        next.delete(fundId);
      } else {
        next.add(fundId);
        if (!fundSets[fundId]) fetchFundSets(fundId);
      }
      return next;
    });
  };

  const toggleSet = (setId: string) => {
    setExpandedSets((prev) => {
      const next = new Set(prev);
      if (next.has(setId)) {
        next.delete(setId);
      } else {
        next.add(setId);
      }
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  async function apiAction(
    url: string,
    method: string,
    entityId: string,
    body?: Record<string, unknown>
  ): Promise<{ ok: boolean; error?: string }> {
    addLoading(entityId);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: data.error || `Request failed (${res.status})` };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    } finally {
      removeLoading(entityId);
    }
  }

  // Approve org
  const approveOrg = async (id: string) => {
    const result = await apiAction(`/api/admin/organisations/${id}/approve`, "PATCH", id);
    if (result.ok) {
      await fetchOrgs();
    } else {
      showError(result.error!);
    }
  };

  // Reject org
  const rejectOrg = async (id: string, reason: string) => {
    const result = await apiAction(`/api/admin/organisations/${id}/reject`, "PATCH", id, { reason });
    if (result.ok) {
      setRejectingId(null);
      await fetchOrgs();
    } else {
      showError(result.error!);
    }
  };

  // Delete org
  const deleteOrg = async (id: string) => {
    const result = await apiAction(`/api/admin/organisations/${id}`, "DELETE", id);
    if (result.ok) {
      setDeletingId(null);
      await fetchOrgs();
    } else {
      showError(result.error!);
    }
  };

  // Publish / unpublish fund (uses the edit endpoint with published toggle)
  const toggleFundPublished = async (fund: FundWithCounts) => {
    const result = await apiAction(`/api/admin/funds/${fund.id}`, "PATCH", fund.id, {
      published: !fund.published,
    });
    if (result.ok) {
      await fetchOrgFunds(fund.organisation_id);
      await fetchOrgs();
    } else {
      showError(result.error!);
    }
  };

  // Reject fund
  const rejectFund = async (id: string, orgId: string, reason: string) => {
    const result = await apiAction(`/api/admin/funds/${id}/reject`, "PATCH", id, { reason });
    if (result.ok) {
      setRejectingId(null);
      await fetchOrgFunds(orgId);
      await fetchOrgs();
    } else {
      showError(result.error!);
    }
  };

  // Delete fund
  const deleteFund = async (id: string, orgId: string) => {
    const result = await apiAction(`/api/admin/funds/${id}`, "DELETE", id);
    if (result.ok) {
      setDeletingId(null);
      await fetchOrgFunds(orgId);
      await fetchOrgs();
    } else {
      showError(result.error!);
    }
  };

  // Approve criteria set
  const approveCriteriaSet = async (id: string, fundId: string, orgId: string) => {
    const result = await apiAction(`/api/admin/criteria-sets/${id}/approve`, "PATCH", id);
    if (result.ok) {
      await fetchFundSets(fundId);
      await fetchOrgFunds(orgId);
      await fetchOrgs();
    } else {
      showError(result.error!);
    }
  };

  // Reject criteria set
  const rejectCriteriaSet = async (id: string, fundId: string, orgId: string, reason: string) => {
    const result = await apiAction(`/api/admin/criteria-sets/${id}/reject`, "PATCH", id, { reason });
    if (result.ok) {
      setRejectingId(null);
      await fetchFundSets(fundId);
      await fetchOrgFunds(orgId);
      await fetchOrgs();
    } else {
      showError(result.error!);
    }
  };

  // Delete criteria set
  const deleteCriteriaSet = async (id: string, fundId: string, orgId: string) => {
    const result = await apiAction(`/api/admin/criteria-sets/${id}`, "DELETE", id);
    if (result.ok) {
      setDeletingId(null);
      await fetchFundSets(fundId);
      await fetchOrgFunds(orgId);
      await fetchOrgs();
    } else {
      showError(result.error!);
    }
  };

  // Approve questions set
  const approveQuestionsSet = async (id: string, fundId: string, orgId: string) => {
    const result = await apiAction(`/api/admin/questions-sets/${id}/approve`, "PATCH", id);
    if (result.ok) {
      await fetchFundSets(fundId);
      await fetchOrgFunds(orgId);
      await fetchOrgs();
    } else {
      showError(result.error!);
    }
  };

  // Reject questions set
  const rejectQuestionsSet = async (id: string, fundId: string, orgId: string, reason: string) => {
    const result = await apiAction(`/api/admin/questions-sets/${id}/reject`, "PATCH", id, { reason });
    if (result.ok) {
      setRejectingId(null);
      await fetchFundSets(fundId);
      await fetchOrgFunds(orgId);
      await fetchOrgs();
    } else {
      showError(result.error!);
    }
  };

  // Delete questions set
  const deleteQuestionsSet = async (id: string, fundId: string, orgId: string) => {
    const result = await apiAction(`/api/admin/questions-sets/${id}`, "DELETE", id);
    if (result.ok) {
      setDeletingId(null);
      await fetchFundSets(fundId);
      await fetchOrgFunds(orgId);
      await fetchOrgs();
    } else {
      showError(result.error!);
    }
  };

  // ---------------------------------------------------------------------------
  // Amend flow for sets
  // ---------------------------------------------------------------------------

  const amendCriteriaSet = async (
    originalId: string,
    fundId: string,
    orgId: string,
    criteriaSet: CriteriaSet
  ) => {
    addLoading(originalId);
    try {
      // 1. Create new auto-approved set
      const createRes = await fetch("/api/admin/criteria-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fund_id: fundId,
          name: criteriaSet.name,
          description: criteriaSet.description,
          criteria_json: criteriaSet.criteria,
        }),
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        showError(data.error || "Failed to create amended set");
        return;
      }

      // 2. Reject original with reason
      const rejectRes = await fetch(`/api/admin/criteria-sets/${originalId}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Amended by admin" }),
      });
      if (!rejectRes.ok) {
        showError("Amended set created but failed to reject original");
      }

      setAmendingId(null);
      await fetchFundSets(fundId);
      await fetchOrgFunds(orgId);
      await fetchOrgs();
    } finally {
      removeLoading(originalId);
    }
  };

  const amendQuestionsSet = async (
    originalId: string,
    fundId: string,
    orgId: string,
    questionsSet: QuestionsSet
  ) => {
    addLoading(originalId);
    try {
      // 1. Create new auto-approved set
      const createRes = await fetch("/api/admin/questions-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fund_id: fundId,
          questions_json: questionsSet.questions,
          overall_word_limit: questionsSet.overall_word_limit,
        }),
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        showError(data.error || "Failed to create amended set");
        return;
      }

      // 2. Reject original
      const rejectRes = await fetch(`/api/admin/questions-sets/${originalId}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Amended by admin" }),
      });
      if (!rejectRes.ok) {
        showError("Amended set created but failed to reject original");
      }

      setAmendingId(null);
      await fetchFundSets(fundId);
      await fetchOrgFunds(orgId);
      await fetchOrgs();
    } finally {
      removeLoading(originalId);
    }
  };

  // ---------------------------------------------------------------------------
  // Edit forms state
  // ---------------------------------------------------------------------------

  const [editOrgForm, setEditOrgForm] = useState<{
    name: string;
    url: string;
    description: string;
  }>({ name: "", url: "", description: "" });

  const [editFundForm, setEditFundForm] = useState<{
    name: string;
    url: string;
    notes: string;
    organisation_id: string;
  }>({ name: "", url: "", notes: "", organisation_id: "" });

  const startEditOrg = (org: OrgWithCounts) => {
    setEditingId(org.id);
    setEditOrgForm({
      name: org.name,
      url: org.url ?? "",
      description: org.description ?? "",
    });
  };

  const saveEditOrg = async (id: string) => {
    const result = await apiAction(`/api/admin/organisations/${id}`, "PATCH", id, {
      name: editOrgForm.name,
      url: editOrgForm.url || null,
      description: editOrgForm.description || null,
    });
    if (result.ok) {
      setEditingId(null);
      await fetchOrgs();
    } else {
      showError(result.error!);
    }
  };

  const startEditFund = (fund: FundWithCounts) => {
    setEditingId(fund.id);
    setEditFundForm({
      name: fund.name,
      url: fund.url ?? "",
      notes: fund.notes ?? "",
      organisation_id: fund.organisation_id,
    });
  };

  const saveEditFund = async (id: string, orgId: string) => {
    const result = await apiAction(`/api/admin/funds/${id}`, "PATCH", id, {
      name: editFundForm.name,
      url: editFundForm.url || null,
      notes: editFundForm.notes || null,
      organisation_id: editFundForm.organisation_id,
    });
    if (result.ok) {
      setEditingId(null);
      // If org changed, refresh both old and new org
      if (editFundForm.organisation_id !== orgId) {
        await fetchOrgFunds(orgId);
        await fetchOrgFunds(editFundForm.organisation_id);
      } else {
        await fetchOrgFunds(orgId);
      }
      await fetchOrgs();
    } else {
      showError(result.error!);
    }
  };

  // ---------------------------------------------------------------------------
  // Create forms state
  // ---------------------------------------------------------------------------

  const [createOrgForm, setCreateOrgForm] = useState({ name: "", url: "", description: "" });
  const [createFundForm, setCreateFundForm] = useState({ name: "", url: "", notes: "" });
  const [createCriteriaForm, setCreateCriteriaForm] = useState({ name: "", criteriaJson: "" });
  const [createQuestionsForm, setCreateQuestionsForm] = useState({
    questionsJson: "",
    overallWordLimit: "",
  });

  const createOrg = async () => {
    if (!createOrgForm.name.trim()) {
      showError("Organisation name is required");
      return;
    }
    addLoading("create-org");
    try {
      const res = await fetch("/api/admin/organisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createOrgForm.name.trim(),
          url: createOrgForm.url || undefined,
          description: createOrgForm.description || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showError(data.error || "Failed to create organisation");
        return;
      }
      setCreatingType(null);
      setCreateOrgForm({ name: "", url: "", description: "" });
      await fetchOrgs();
    } finally {
      removeLoading("create-org");
    }
  };

  const createFund = async (orgId: string) => {
    if (!createFundForm.name.trim()) {
      showError("Fund name is required");
      return;
    }
    addLoading(`create-fund-${orgId}`);
    try {
      const res = await fetch("/api/admin/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createFundForm.name.trim(),
          organisation_id: orgId,
          url: createFundForm.url || undefined,
          notes: createFundForm.notes || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showError(data.error || "Failed to create fund");
        return;
      }
      setCreatingType(null);
      setCreateFundForm({ name: "", url: "", notes: "" });
      await fetchOrgFunds(orgId);
      await fetchOrgs();
    } finally {
      removeLoading(`create-fund-${orgId}`);
    }
  };

  const createCriteriaSet = async (fundId: string, orgId: string) => {
    if (!createCriteriaForm.name.trim()) {
      showError("Name is required");
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(createCriteriaForm.criteriaJson);
    } catch {
      showError("Invalid JSON for criteria");
      return;
    }
    addLoading(`create-criteria-${fundId}`);
    try {
      const res = await fetch("/api/admin/criteria-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fund_id: fundId,
          name: createCriteriaForm.name.trim(),
          criteria_json: parsed,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showError(data.error || "Failed to create criteria set");
        return;
      }
      setCreatingType(null);
      setCreateCriteriaForm({ name: "", criteriaJson: "" });
      await fetchFundSets(fundId);
      await fetchOrgFunds(orgId);
      await fetchOrgs();
    } finally {
      removeLoading(`create-criteria-${fundId}`);
    }
  };

  const createQuestionsSet = async (fundId: string, orgId: string) => {
    let parsed;
    try {
      parsed = JSON.parse(createQuestionsForm.questionsJson);
    } catch {
      showError("Invalid JSON for questions");
      return;
    }
    addLoading(`create-questions-${fundId}`);
    try {
      const res = await fetch("/api/admin/questions-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fund_id: fundId,
          questions_json: parsed,
          overall_word_limit: createQuestionsForm.overallWordLimit
            ? parseInt(createQuestionsForm.overallWordLimit, 10)
            : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showError(data.error || "Failed to create questions set");
        return;
      }
      setCreatingType(null);
      setCreateQuestionsForm({ questionsJson: "", overallWordLimit: "" });
      await fetchFundSets(fundId);
      await fetchOrgFunds(orgId);
      await fetchOrgs();
    } finally {
      removeLoading(`create-questions-${fundId}`);
    }
  };

  // ---------------------------------------------------------------------------
  // Amend state for editable preview
  // ---------------------------------------------------------------------------

  const [amendedCriteria, setAmendedCriteria] = useState<CriteriaSet | null>(null);
  const [amendedQuestions, setAmendedQuestions] = useState<QuestionsSet | null>(null);

  const startAmendCriteria = (cs: CriteriaSetRow) => {
    setAmendingId(cs.id);
    const criteria = Array.isArray(cs.criteria_json) ? cs.criteria_json : [];
    setAmendedCriteria({
      name: cs.name || "Criteria",
      description: cs.description ?? undefined,
      criteria: criteria.map((c: Json, i: number) => {
        const obj = c && typeof c === "object" && !Array.isArray(c) ? c : {};
        return {
          id: (obj as Record<string, Json | undefined>).id as string ?? `c${i + 1}`,
          criterion: (obj as Record<string, Json | undefined>).criterion as string ?? "",
          weight: (obj as Record<string, Json | undefined>).weight as string | undefined,
          sub_questions: Array.isArray((obj as Record<string, Json | undefined>).sub_questions)
            ? ((obj as Record<string, Json | undefined>).sub_questions as Json[]).map((sq: Json) => {
                if (typeof sq === "string") return { text: sq, required: true };
                if (sq && typeof sq === "object" && !Array.isArray(sq)) {
                  const sqObj = sq as Record<string, Json | undefined>;
                  return {
                    text: (sqObj.text as string) ?? "",
                    required: sqObj.required !== false,
                  };
                }
                return { text: "", required: true };
              })
            : [],
        };
      }),
    });
  };

  const startAmendQuestions = (qs: QuestionsSetRow) => {
    setAmendingId(qs.id);
    const questions = Array.isArray(qs.questions_json) ? qs.questions_json : [];
    setAmendedQuestions({
      questions: questions.map((q: Json, i: number) => {
        const obj = q && typeof q === "object" && !Array.isArray(q) ? q : {};
        const qObj = obj as Record<string, Json | undefined>;
        return {
          id: (qObj.id as string) ?? `q${i + 1}`,
          question: (qObj.question as string) ?? "",
          word_count_min: typeof qObj.word_count_min === "number" ? qObj.word_count_min : undefined,
          word_count_max: typeof qObj.word_count_max === "number" ? qObj.word_count_max : undefined,
          guidance: typeof qObj.guidance === "string" ? qObj.guidance : undefined,
          priority: typeof qObj.priority === "number" ? qObj.priority : undefined,
          field_type: typeof qObj.field_type === "string"
            ? (qObj.field_type as "text_long")
            : undefined,
          options: Array.isArray(qObj.options)
            ? (qObj.options as string[])
            : undefined,
        };
      }),
      overall_word_limit: qs.overall_word_limit ?? undefined,
    });
  };

  // ---------------------------------------------------------------------------
  // Render: Criteria content display (read-only)
  // ---------------------------------------------------------------------------

  function renderCriteriaContent(criteriaJson: Json) {
    if (!Array.isArray(criteriaJson)) return <p className="text-sm text-zinc-500">No criteria data</p>;
    return (
      <div className="space-y-2">
        {criteriaJson.map((c: Json, i: number) => {
          const obj = c && typeof c === "object" && !Array.isArray(c)
            ? (c as Record<string, Json | undefined>)
            : {};
          const criterion = (obj.criterion as string) ?? `Criterion ${i + 1}`;
          const weight = obj.weight as string | undefined;
          const subQuestions = Array.isArray(obj.sub_questions) ? (obj.sub_questions as Json[]) : [];

          return (
            <div
              key={i}
              className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50"
            >
              <div className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {criterion}
                    {weight && (
                      <span className="ml-2 text-xs text-zinc-500">({weight})</span>
                    )}
                  </p>
                  {subQuestions.length > 0 && (
                    <ul className="mt-1 ml-4 list-disc space-y-0.5">
                      {subQuestions.map((sq: Json, sqi: number) => {
                        const sqText =
                          typeof sq === "string"
                            ? sq
                            : sq && typeof sq === "object" && !Array.isArray(sq)
                              ? ((sq as Record<string, Json | undefined>).text as string) ?? ""
                              : "";
                        return (
                          <li key={sqi} className="text-xs text-zinc-600 dark:text-zinc-400">
                            {sqText}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Questions content display (read-only)
  // ---------------------------------------------------------------------------

  function renderQuestionsContent(questionsJson: Json, overallWordLimit: number | null) {
    if (!Array.isArray(questionsJson))
      return <p className="text-sm text-zinc-500">No questions data</p>;
    return (
      <div className="space-y-2">
        {overallWordLimit && (
          <p className="text-xs text-zinc-500 mb-2">
            Overall word limit: <span className="font-medium">{overallWordLimit}</span>
          </p>
        )}
        {questionsJson.map((q: Json, i: number) => {
          const obj = q && typeof q === "object" && !Array.isArray(q)
            ? (q as Record<string, Json | undefined>)
            : {};
          const question = (obj.question as string) ?? `Question ${i + 1}`;
          const fieldType = (obj.field_type as string) ?? "text_long";
          const wordMin = typeof obj.word_count_min === "number" ? obj.word_count_min : null;
          const wordMax = typeof obj.word_count_max === "number" ? obj.word_count_max : null;
          const guidance = typeof obj.guidance === "string" ? obj.guidance : null;

          return (
            <div
              key={i}
              className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50"
            >
              <div className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-100 text-[10px] font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {question}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
                    <span>{fieldType.replace("_", " ")}</span>
                    {(wordMin || wordMax) && (
                      <span>
                        {wordMin ?? "?"}-{wordMax ?? "?"} words
                      </span>
                    )}
                  </div>
                  {guidance && (
                    <p className="mt-1 text-xs text-zinc-500 italic">{guidance}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Set Row
  // ---------------------------------------------------------------------------

  function renderCriteriaSetRow(
    cs: CriteriaSetRow,
    fundId: string,
    orgId: string
  ) {
    const isExpanded = expandedSets.has(cs.id);
    const isAmending = amendingId === cs.id;
    const isRejecting = rejectingId === cs.id;
    const isDeleting = deletingId === cs.id;
    const isLoading = loading.has(cs.id);
    const criteriaCount = countJson(cs.criteria_json);

    return (
      <div key={cs.id} className="border border-zinc-200 dark:border-zinc-700 rounded-lg">
        {/* Row header */}
        <button
          onClick={() => toggleSet(cs.id)}
          className="w-full flex items-center gap-2 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg"
        >
          <ChevronIcon expanded={isExpanded} />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {cs.name || cs.label || "Untitled"}
            </span>
            <span className="ml-2 text-xs text-zinc-500">
              {criteriaCount} criteria
            </span>
            <span className="ml-2 text-xs text-zinc-500">{formatDate(cs.created_at)}</span>
          </div>
          {cs.approved ? <ApprovedBadge /> : <PendingStatusBadge />}
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-700">
            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 mt-2 mb-3">
              {!cs.approved && (
                <>
                  <button
                    onClick={() => approveCriteriaSet(cs.id, fundId, orgId)}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setRejectingId(cs.id)}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => startAmendCriteria(cs)}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 disabled:opacity-50"
                  >
                    Amend
                  </button>
                </>
              )}
              <button
                onClick={() => setDeletingId(cs.id)}
                disabled={isLoading}
                className="px-3 py-1.5 text-sm rounded-md bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 disabled:opacity-50"
              >
                Delete
              </button>
            </div>

            {/* Reject form */}
            {isRejecting && (
              <RejectForm
                onSubmit={(reason) => rejectCriteriaSet(cs.id, fundId, orgId, reason)}
                onCancel={() => setRejectingId(null)}
                loading={isLoading}
              />
            )}

            {/* Delete confirm */}
            {isDeleting && (
              <ConfirmDialog
                message="Are you sure? This cannot be undone."
                onConfirm={() => deleteCriteriaSet(cs.id, fundId, orgId)}
                onCancel={() => setDeletingId(null)}
                loading={isLoading}
              />
            )}

            {/* Amend view */}
            {isAmending && amendedCriteria ? (
              <div className="mt-2 space-y-3">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Edit criteria below, then save:
                </p>
                <CriteriaPreview
                  criteriaSet={amendedCriteria}
                  onChange={setAmendedCriteria}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      amendCriteriaSet(cs.id, fundId, orgId, amendedCriteria)
                    }
                    disabled={isLoading}
                    className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isLoading ? "Saving..." : "Save Amended"}
                  </button>
                  <button
                    onClick={() => {
                      setAmendingId(null);
                      setAmendedCriteria(null);
                    }}
                    className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Read-only content */
              <div className="mt-2">{renderCriteriaContent(cs.criteria_json)}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderQuestionsSetRow(
    qs: QuestionsSetRow,
    fundId: string,
    orgId: string
  ) {
    const isExpanded = expandedSets.has(qs.id);
    const isAmending = amendingId === qs.id;
    const isRejecting = rejectingId === qs.id;
    const isDeleting = deletingId === qs.id;
    const isLoading = loading.has(qs.id);
    const questionsCount = countJson(qs.questions_json);

    return (
      <div key={qs.id} className="border border-zinc-200 dark:border-zinc-700 rounded-lg">
        {/* Row header */}
        <button
          onClick={() => toggleSet(qs.id)}
          className="w-full flex items-center gap-2 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg"
        >
          <ChevronIcon expanded={isExpanded} />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {qs.label || "Untitled"}
            </span>
            <span className="ml-2 text-xs text-zinc-500">
              {questionsCount} questions
            </span>
            {qs.overall_word_limit && (
              <span className="ml-2 text-xs text-zinc-500">
                ({qs.overall_word_limit} word limit)
              </span>
            )}
            <span className="ml-2 text-xs text-zinc-500">{formatDate(qs.created_at)}</span>
          </div>
          {qs.approved ? <ApprovedBadge /> : <PendingStatusBadge />}
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-700">
            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 mt-2 mb-3">
              {!qs.approved && (
                <>
                  <button
                    onClick={() => approveQuestionsSet(qs.id, fundId, orgId)}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setRejectingId(qs.id)}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => startAmendQuestions(qs)}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 disabled:opacity-50"
                  >
                    Amend
                  </button>
                </>
              )}
              <button
                onClick={() => setDeletingId(qs.id)}
                disabled={isLoading}
                className="px-3 py-1.5 text-sm rounded-md bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 disabled:opacity-50"
              >
                Delete
              </button>
            </div>

            {/* Reject form */}
            {isRejecting && (
              <RejectForm
                onSubmit={(reason) => rejectQuestionsSet(qs.id, fundId, orgId, reason)}
                onCancel={() => setRejectingId(null)}
                loading={isLoading}
              />
            )}

            {/* Delete confirm */}
            {isDeleting && (
              <ConfirmDialog
                message="Are you sure? This cannot be undone."
                onConfirm={() => deleteQuestionsSet(qs.id, fundId, orgId)}
                onCancel={() => setDeletingId(null)}
                loading={isLoading}
              />
            )}

            {/* Amend view */}
            {isAmending && amendedQuestions ? (
              <div className="mt-2 space-y-3">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Edit questions below, then save:
                </p>
                <QuestionsPreview
                  questionsSet={amendedQuestions}
                  onChange={setAmendedQuestions}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      amendQuestionsSet(qs.id, fundId, orgId, amendedQuestions)
                    }
                    disabled={isLoading}
                    className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isLoading ? "Saving..." : "Save Amended"}
                  </button>
                  <button
                    onClick={() => {
                      setAmendingId(null);
                      setAmendedQuestions(null);
                    }}
                    className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Read-only content */
              <div className="mt-2">
                {renderQuestionsContent(qs.questions_json, qs.overall_word_limit)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Fund Row
  // ---------------------------------------------------------------------------

  function renderFundRow(fund: FundWithCounts, orgId: string) {
    const isExpanded = expandedFunds.has(fund.id);
    const isEditing = editingId === fund.id;
    const isRejecting = rejectingId === fund.id;
    const isDeleting = deletingId === fund.id;
    const isLoading = loading.has(fund.id);
    const sets = fundSets[fund.id];

    return (
      <div key={fund.id} className="border border-zinc-200 dark:border-zinc-700 rounded-lg">
        {/* Fund row header */}
        <button
          onClick={() => toggleFund(fund.id)}
          className="w-full flex items-center gap-2 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg"
        >
          <ChevronIcon expanded={isExpanded} />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {fund.name}
            </span>
            {fund.url && (
              <span
                className="ml-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(fund.url!, "_blank");
                }}
              >
                {truncate(fund.url, 40)}
              </span>
            )}
            {fund.notes && (
              <span className="ml-2 text-xs text-zinc-500">
                {truncate(fund.notes, 60)}
              </span>
            )}
          </div>
          <PendingBadge count={fund.pending_total} />
          {isLoading && <Spinner />}
        </button>

        {/* Expanded fund content */}
        {isExpanded && (
          <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-700">
            {/* Action buttons */}
            {!isEditing && (
              <div className="flex flex-wrap gap-2 mt-2 mb-3">
                <button
                  onClick={() => toggleFundPublished(fund)}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {fund.published ? "Unpublish" : "Publish"}
                </button>
                {!fund.published && (
                  <button
                    onClick={() => setRejectingId(fund.id)}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                )}
                <button
                  onClick={() => startEditFund(fund)}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeletingId(fund.id)}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-sm rounded-md bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            )}

            {/* Edit form */}
            {isEditing && (
              <div className="mt-2 mb-3 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
                <div>
                  <label className="block text-xs font-medium text-zinc-500">Name</label>
                  <input
                    type="text"
                    value={editFundForm.name}
                    onChange={(e) => setEditFundForm((f) => ({ ...f, name: e.target.value }))}
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500">URL</label>
                  <input
                    type="text"
                    value={editFundForm.url}
                    onChange={(e) => setEditFundForm((f) => ({ ...f, url: e.target.value }))}
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500">Notes</label>
                  <textarea
                    value={editFundForm.notes}
                    onChange={(e) => setEditFundForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500">Organisation</label>
                  <select
                    value={editFundForm.organisation_id}
                    onChange={(e) =>
                      setEditFundForm((f) => ({ ...f, organisation_id: e.target.value }))
                    }
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEditFund(fund.id, orgId)}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isLoading ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Reject form */}
            {isRejecting && (
              <RejectForm
                onSubmit={(reason) => rejectFund(fund.id, orgId, reason)}
                onCancel={() => setRejectingId(null)}
                loading={isLoading}
              />
            )}

            {/* Delete confirm */}
            {isDeleting && (
              <ConfirmDialog
                message="Are you sure? This cannot be undone."
                onConfirm={() => deleteFund(fund.id, orgId)}
                onCancel={() => setDeletingId(null)}
                loading={isLoading}
              />
            )}

            {/* Sets content */}
            {isLoading && !sets && (
              <div className="flex items-center gap-2 py-4">
                <Spinner />
                <span className="text-sm text-zinc-500">Loading sets...</span>
              </div>
            )}

            {sets && (
              <div className="mt-3 pl-6 border-l border-zinc-200 dark:border-zinc-700 space-y-4">
                {/* Criteria Sets */}
                <div>
                  <SectionHeader title="Criteria Sets" count={sets.criteria_sets.length}>
                    <button
                      onClick={() => {
                        setCreatingType(`criteria-${fund.id}`);
                        setCreateCriteriaForm({ name: "", criteriaJson: "" });
                      }}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                    >
                      + New Criteria Set
                    </button>
                  </SectionHeader>

                  {/* Create criteria set form */}
                  {creatingType === `criteria-${fund.id}` && (
                    <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-950/30">
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-zinc-500">Name</label>
                          <input
                            type="text"
                            value={createCriteriaForm.name}
                            onChange={(e) =>
                              setCreateCriteriaForm((f) => ({ ...f, name: e.target.value }))
                            }
                            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            placeholder="Criteria set name"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-500">
                            Criteria JSON
                          </label>
                          <textarea
                            value={createCriteriaForm.criteriaJson}
                            onChange={(e) =>
                              setCreateCriteriaForm((f) => ({
                                ...f,
                                criteriaJson: e.target.value,
                              }))
                            }
                            rows={6}
                            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            placeholder='[{"id":"c1","criterion":"...","sub_questions":[]}]'
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => createCriteriaSet(fund.id, orgId)}
                            disabled={loading.has(`create-criteria-${fund.id}`)}
                            className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {loading.has(`create-criteria-${fund.id}`)
                              ? "Creating..."
                              : "Create"}
                          </button>
                          <button
                            onClick={() => setCreatingType(null)}
                            className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {sets.criteria_sets.length === 0 ? (
                    <p className="text-xs text-zinc-500">No criteria sets</p>
                  ) : (
                    <div className="space-y-2">
                      {sets.criteria_sets.map((cs) =>
                        renderCriteriaSetRow(cs, fund.id, orgId)
                      )}
                    </div>
                  )}
                </div>

                {/* Questions Sets */}
                <div>
                  <SectionHeader title="Questions Sets" count={sets.questions_sets.length}>
                    <button
                      onClick={() => {
                        setCreatingType(`questions-${fund.id}`);
                        setCreateQuestionsForm({ questionsJson: "", overallWordLimit: "" });
                      }}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                    >
                      + New Questions Set
                    </button>
                  </SectionHeader>

                  {/* Create questions set form */}
                  {creatingType === `questions-${fund.id}` && (
                    <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-950/30">
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-zinc-500">
                            Questions JSON
                          </label>
                          <textarea
                            value={createQuestionsForm.questionsJson}
                            onChange={(e) =>
                              setCreateQuestionsForm((f) => ({
                                ...f,
                                questionsJson: e.target.value,
                              }))
                            }
                            rows={6}
                            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            placeholder='[{"id":"q1","question":"..."}]'
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-500">
                            Overall Word Limit
                          </label>
                          <input
                            type="number"
                            value={createQuestionsForm.overallWordLimit}
                            onChange={(e) =>
                              setCreateQuestionsForm((f) => ({
                                ...f,
                                overallWordLimit: e.target.value,
                              }))
                            }
                            className="mt-1 w-32 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            placeholder="e.g. 5000"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => createQuestionsSet(fund.id, orgId)}
                            disabled={loading.has(`create-questions-${fund.id}`)}
                            className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {loading.has(`create-questions-${fund.id}`)
                              ? "Creating..."
                              : "Create"}
                          </button>
                          <button
                            onClick={() => setCreatingType(null)}
                            className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {sets.questions_sets.length === 0 ? (
                    <p className="text-xs text-zinc-500">No questions sets</p>
                  ) : (
                    <div className="space-y-2">
                      {sets.questions_sets.map((qs) =>
                        renderQuestionsSetRow(qs, fund.id, orgId)
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Org Row
  // ---------------------------------------------------------------------------

  function renderOrgRow(org: OrgWithCounts) {
    const isExpanded = expandedOrgs.has(org.id);
    const isEditing = editingId === org.id;
    const isRejecting = rejectingId === org.id;
    const isDeleting = deletingId === org.id;
    const isLoading = loading.has(org.id);
    const funds = orgFunds[org.id];

    const pendingFunds = funds?.filter((f) => !f.published) ?? [];
    const publishedFunds = funds?.filter((f) => f.published) ?? [];

    return (
      <div
        key={org.id}
        className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg"
      >
        {/* Org row header */}
        <button
          onClick={() => toggleOrg(org.id)}
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-zinc-50 dark:hover:bg-zinc-750 rounded-lg"
        >
          <ChevronIcon expanded={isExpanded} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{org.name}</span>
              {org.url && (
                <span
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(org.url!, "_blank");
                  }}
                >
                  {truncate(org.url, 30)}
                </span>
              )}
            </div>
            {org.description && (
              <p className="text-sm text-zinc-500 mt-0.5">{truncate(org.description, 100)}</p>
            )}
            <p className="text-xs text-zinc-400 mt-0.5">
              {org.total_funds} fund{org.total_funds !== 1 ? "s" : ""} &middot; {formatDate(org.created_at)}
            </p>
          </div>
          <PendingBadge count={org.pending_total + (org.approved ? 0 : 1)} />
          {isLoading && <Spinner />}
        </button>

        {/* Expanded org content */}
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-zinc-100 dark:border-zinc-700">
            {/* Action buttons */}
            {!isEditing && (
              <div className="flex flex-wrap gap-2 mt-3 mb-3">
                {!org.approved && (
                  <>
                    <button
                      onClick={() => approveOrg(org.id)}
                      disabled={isLoading}
                      className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectingId(org.id)}
                      disabled={isLoading}
                      className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}
                <button
                  onClick={() => startEditOrg(org)}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeletingId(org.id)}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-sm rounded-md bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            )}

            {/* Edit form */}
            {isEditing && (
              <div className="mt-3 mb-3 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
                <div>
                  <label className="block text-xs font-medium text-zinc-500">Name</label>
                  <input
                    type="text"
                    value={editOrgForm.name}
                    onChange={(e) =>
                      setEditOrgForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500">URL</label>
                  <input
                    type="text"
                    value={editOrgForm.url}
                    onChange={(e) =>
                      setEditOrgForm((f) => ({ ...f, url: e.target.value }))
                    }
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500">Description</label>
                  <textarea
                    value={editOrgForm.description}
                    onChange={(e) =>
                      setEditOrgForm((f) => ({ ...f, description: e.target.value }))
                    }
                    rows={2}
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEditOrg(org.id)}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isLoading ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Reject form */}
            {isRejecting && (
              <RejectForm
                onSubmit={(reason) => rejectOrg(org.id, reason)}
                onCancel={() => setRejectingId(null)}
                loading={isLoading}
              />
            )}

            {/* Delete confirm */}
            {isDeleting && (
              <ConfirmDialog
                message="Are you sure? This cannot be undone. Organisations with funds cannot be deleted."
                onConfirm={() => deleteOrg(org.id)}
                onCancel={() => setDeletingId(null)}
                loading={isLoading}
              />
            )}

            {/* Funds loading */}
            {isLoading && !funds && (
              <div className="flex items-center gap-2 py-4">
                <Spinner />
                <span className="text-sm text-zinc-500">Loading funds...</span>
              </div>
            )}

            {/* Funds content */}
            {funds && (
              <div className="mt-3 pl-6 border-l border-zinc-200 dark:border-zinc-700 space-y-4">
                {/* Create fund button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setCreatingType(`fund-${org.id}`);
                      setCreateFundForm({ name: "", url: "", notes: "" });
                    }}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                  >
                    + New Fund
                  </button>
                </div>

                {/* Create fund form */}
                {creatingType === `fund-${org.id}` && (
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-950/30">
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-zinc-500">Name</label>
                        <input
                          type="text"
                          value={createFundForm.name}
                          onChange={(e) =>
                            setCreateFundForm((f) => ({ ...f, name: e.target.value }))
                          }
                          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                          placeholder="Fund name"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-500">URL</label>
                        <input
                          type="text"
                          value={createFundForm.url}
                          onChange={(e) =>
                            setCreateFundForm((f) => ({ ...f, url: e.target.value }))
                          }
                          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                          placeholder="https://..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-500">Notes</label>
                        <textarea
                          value={createFundForm.notes}
                          onChange={(e) =>
                            setCreateFundForm((f) => ({ ...f, notes: e.target.value }))
                          }
                          rows={2}
                          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                          placeholder="Additional notes..."
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => createFund(org.id)}
                          disabled={loading.has(`create-fund-${org.id}`)}
                          className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {loading.has(`create-fund-${org.id}`) ? "Creating..." : "Create Fund"}
                        </button>
                        <button
                          onClick={() => setCreatingType(null)}
                          className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pending Funds */}
                {pendingFunds.length > 0 && (
                  <div>
                    <SectionHeader title="Pending / Unpublished Funds" count={pendingFunds.length} />
                    <div className="space-y-2">
                      {pendingFunds.map((fund) => renderFundRow(fund, org.id))}
                    </div>
                  </div>
                )}

                {/* Published Funds */}
                {publishedFunds.length > 0 && (
                  <div>
                    <SectionHeader title="Published Funds" count={publishedFunds.length} />
                    <div className="space-y-2">
                      {publishedFunds.map((fund) => renderFundRow(fund, org.id))}
                    </div>
                  </div>
                )}

                {funds.length === 0 && (
                  <p className="text-sm text-zinc-500">No funds for this organisation.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  const pendingOrgs = orgs.filter((o) => !o.approved);
  const approvedOrgs = orgs.filter((o) => o.approved);

  if (initialLoading) {
    return (
      <div className="flex items-center gap-2 py-8">
        <Spinner className="h-5 w-5" />
        <span className="text-zinc-500">Loading content...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 font-medium underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create Org button */}
      <div className="flex justify-end">
        <button
          onClick={() => {
            setCreatingType("org");
            setCreateOrgForm({ name: "", url: "", description: "" });
          }}
          className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
        >
          + New Organisation
        </button>
      </div>

      {/* Create org form */}
      {creatingType === "org" && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-950/30">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Create Organisation
          </h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-zinc-500">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={createOrgForm.name}
                onChange={(e) => setCreateOrgForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="Organisation name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">URL</label>
              <input
                type="text"
                value={createOrgForm.url}
                onChange={(e) => setCreateOrgForm((f) => ({ ...f, url: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Description</label>
              <textarea
                value={createOrgForm.description}
                onChange={(e) => setCreateOrgForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="Brief description..."
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={createOrg}
                disabled={loading.has("create-org")}
                className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading.has("create-org") ? "Creating..." : "Create Organisation"}
              </button>
              <button
                onClick={() => setCreatingType(null)}
                className="px-3 py-1.5 text-sm rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Organisations */}
      {pendingOrgs.length > 0 && (
        <section>
          <SectionHeader title="Pending Organisations" count={pendingOrgs.length} />
          <div className="space-y-2">
            {pendingOrgs.map((org) => renderOrgRow(org))}
          </div>
        </section>
      )}

      {/* Approved Organisations */}
      <section>
        <SectionHeader title="Approved Organisations" count={approvedOrgs.length} />
        {approvedOrgs.length === 0 ? (
          <p className="text-sm text-zinc-500">No approved organisations yet.</p>
        ) : (
          <div className="space-y-2">
            {approvedOrgs.map((org) => renderOrgRow(org))}
          </div>
        )}
      </section>
    </div>
  );
}
