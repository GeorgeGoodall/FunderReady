import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS ensures user owns this review
  const { data: review } = await supabase
    .from("reviews")
    .select("status, output_file_path, bid_file_name")
    .eq("id", id)
    .single();

  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  if (review.status !== "completed" || !review.output_file_path) {
    return NextResponse.json(
      { error: "Review not ready for download" },
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();
  const { data: fileData, error: downloadError } = await serviceClient.storage
    .from("review-outputs")
    .download(review.output_file_path);

  if (downloadError || !fileData) {
    console.error("Download error:", downloadError);
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 }
    );
  }

  const bidName = review.bid_file_name.replace(/\.docx$/i, "");
  const fileName = `${bidName} - FunderReady Review.docx`;

  return new Response(fileData, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
