import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { reviewSubmitted } from "@/lib/inngest/functions";
import { applicationReviewRequested } from "@/lib/inngest/application-review";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [reviewSubmitted, applicationReviewRequested],
});
