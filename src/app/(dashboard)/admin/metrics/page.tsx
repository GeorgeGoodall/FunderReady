import { AdminMetrics } from "@/app/(dashboard)/admin/AdminMetrics";

export const dynamic = "force-dynamic";

export default function AdminMetricsPage() {
  return (
    <div>
      <h2 className="text-lg font-semibold">AI Usage Metrics</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Token consumption, costs, and platform statistics.
      </p>
      <div className="mt-4">
        <AdminMetrics />
      </div>
    </div>
  );
}
