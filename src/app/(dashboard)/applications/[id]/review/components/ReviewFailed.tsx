import Link from "next/link";
import { ReviewCard } from "./ReviewCard";

interface ReviewFailedProps {
  review: { error_message: string | null };
  application: { id: string };
}

export function ReviewFailed({ review, application }: ReviewFailedProps) {
  return (
    <>
      <ReviewCard variant="error">
        <h2 className="font-semibold text-red-700 dark:text-red-400">Review Failed</h2>
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {review.error_message ?? "An unexpected error occurred."}
        </p>
      </ReviewCard>
      <Link
        href={`/applications/${application.id}`}
        className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      >
        Edit &amp; Retry
      </Link>
    </>
  );
}
