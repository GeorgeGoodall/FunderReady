export function BillingClient({ tier }: { tier: "free" | "basic" | "pro" }) {
  if (tier === "free") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800/50 dark:bg-amber-900/10">
        <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200">
          Closed Beta
        </h2>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
          FunderReady is currently in closed beta. Paid plans are not yet available to the public — full launch is coming soon.
        </p>
        <a
          href="mailto:hello@funderready.com?subject=Beta%20access%20request%20%E2%80%94%20FunderReady&body=Hi%20FunderReady%20team%2C%0A%0AI%27d%20like%20to%20request%20beta%20access.%0A%0AName%3A%20%5Byour%20name%5D%0AOrganisation%20(if%20applicable)%3A%20%5Bname%5D%0ARole%3A%20%5Be.g.%20Grants%20Manager%2C%20Fundraiser%2C%20freelance%20bid%20writer%5D%0AHow%20I%20heard%20about%20FunderReady%3A%20%5Boptional%5D%0A%0AThanks"
          className="mt-3 inline-block rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-700"
        >
          Apply for early access
        </a>
      </div>
    );
  }

  // Subscribed user (granted beta access) — top-ups not yet available
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
      <h2 className="text-lg font-semibold">Credit top-ups</h2>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Credit top-ups will be available at full launch. If you need more credits in the meantime, please get in touch.
      </p>
    </div>
  );
}
