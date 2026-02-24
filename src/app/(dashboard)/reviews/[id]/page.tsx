import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { ReviewDetail } from "./ReviewDetail";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: review } = await supabase
    .from("reviews")
    .select("id, status, bid_file_name, created_at, output_file_path, error_message")
    .eq("id", id)
    .single();

  if (!review) notFound();

  const { data: results } = await supabase
    .from("review_results")
    .select("progress, results")
    .eq("review_id", id)
    .single();

  return (
    <div>
      <h1 className="text-2xl font-bold">{review.bid_file_name}</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Submitted{" "}
        {new Date(review.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
      <div className="mt-6">
        <ReviewDetail
          review={review}
          progress={results?.progress as Record<string, unknown> | null}
          results={results?.results as Record<string, unknown> | null}
        />
      </div>
    </div>
  );
}
