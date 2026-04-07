interface Fund {
  id: string;
  name: string;
  organisation: { id: string; name: string } | null;
  url: string | null;
  notes: string | null;
  opens_at: string | null;
  closes_at: string | null;
  created_at: string;
  application_format: "question_form" | "structured_doc" | "unstructured_doc";
}

interface FundSearchResultsProps {
  results: Fund[];
  onSelect: (fund: Fund) => void;
}

export function FundSearchResults({ results, onSelect }: FundSearchResultsProps) {
  if (results.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {results.map((fund) => (
        <button
          key={fund.id}
          onClick={() => onSelect(fund)}
          className="w-full rounded-lg border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          <p className="text-sm font-medium">{fund.name}</p>
          {fund.organisation && (
            <p className="text-xs text-zinc-500">{fund.organisation.name}</p>
          )}
        </button>
      ))}
    </div>
  );
}
