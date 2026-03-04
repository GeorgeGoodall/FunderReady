export function BillingClient({ tier }: { tier: "free" | "pro" }) {
  if (tier === "pro") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-800 dark:bg-emerald-900/20">
        <h3 className="text-lg font-semibold text-emerald-800 dark:text-emerald-200">
          Pro Access Active
        </h3>
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
          You have full access to FunderReady during the beta. Enjoy 10 reviews
          per month with inline comments and improvement appendix.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800/50">
      <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
        Coming Soon
      </h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Subscriptions are not yet available. Contact us for beta access.
      </p>
    </div>
  );
}
