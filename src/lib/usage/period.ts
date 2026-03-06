/**
 * Computes the usage period key and reset date.
 *
 * Pro users with a valid current_period_end: period key is the billing period
 * start date (end − 1 month) as "YYYY-MM-DD", reset date is the period end.
 *
 * Free users (or missing period end): period key is "YYYY-MM" (calendar month),
 * reset date is the 1st of the next calendar month.
 */
export function getUsagePeriod(
  tier: string,
  currentPeriodEnd: string | null | undefined
): { periodKey: string; resetDate: Date } {
  if ((tier === "pro" || tier === "basic") && currentPeriodEnd) {
    const end = new Date(currentPeriodEnd);
    if (!isNaN(end.getTime())) {
      // Period start = end minus 1 month
      const start = new Date(end);
      start.setUTCMonth(start.getUTCMonth() - 1);

      const yyyy = start.getUTCFullYear();
      const mm = String(start.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(start.getUTCDate()).padStart(2, "0");

      return { periodKey: `${yyyy}-${mm}-${dd}`, resetDate: end };
    }
  }

  // Free tier or invalid period end — calendar month
  const now = new Date();
  const periodKey = now.toISOString().slice(0, 7); // "YYYY-MM"
  const resetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return { periodKey, resetDate };
}
