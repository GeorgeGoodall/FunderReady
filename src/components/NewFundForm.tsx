"use client";

import { useState } from "react";
import { OrganisationSelector, type OrgOption } from "./OrganisationSelector";

export interface NewFundData {
  name: string;
  organisationId?: string;
  newOrg?: { name: string; url?: string; description?: string };
  url?: string;
  notes?: string;
  shared?: boolean;
}

interface NewFundFormProps {
  suggestedName?: string;
  onSubmit: (data: NewFundData) => void;
  onCancel: () => void;
}

export function NewFundForm({ suggestedName = "", onSubmit, onCancel }: NewFundFormProps) {
  const [name, setName] = useState(suggestedName);
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [shared, setShared] = useState(false);

  // Org state: either a selected existing org or a new org name
  const [selectedOrg, setSelectedOrg] = useState<OrgOption | null>(null);
  const [newOrgName, setNewOrgName] = useState("");

  const handleOrgSelect = (org: OrgOption) => {
    setSelectedOrg(org);
    setNewOrgName("");
  };

  const handleOrgCreateNew = (orgName: string) => {
    setNewOrgName(orgName);
    setSelectedOrg(null);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;

    const data: NewFundData = {
      name: name.trim(),
      url: url.trim() || undefined,
      notes: notes.trim() || undefined,
      shared,
    };

    if (selectedOrg) {
      data.organisationId = selectedOrg.id;
    } else if (newOrgName.trim()) {
      data.newOrg = { name: newOrgName.trim() };
    }

    onSubmit(data);
  };

  const orgLabel = selectedOrg
    ? selectedOrg.name
    : newOrgName
      ? `"${newOrgName}" (new)`
      : null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="font-semibold">Create New Fund</h3>
      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Fund name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Community Ownership Fund"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Funder organisation (optional)
          </label>
          {orgLabel ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800">
                {orgLabel}
              </span>
              <button
                type="button"
                onClick={() => { setSelectedOrg(null); setNewOrgName(""); }}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="mt-1">
              <OrganisationSelector
                onSelect={handleOrgSelect}
                onCreateNew={handleOrgCreateNew}
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Fund URL (optional)
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Notes (optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Round 2 only"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3">
          <input
            type="checkbox"
            id="shared"
            checked={shared}
            onChange={(e) => setShared(e.target.checked)}
            className="mt-1 rounded border-zinc-300 dark:border-zinc-600"
          />
          <label htmlFor="shared" className="text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-medium">Share with community</span>
            <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
              Share with other FunderReady users after admin approval
            </span>
          </label>
        </div>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create Fund
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
