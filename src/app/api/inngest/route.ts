import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { applicationReviewRequested } from "@/lib/inngest/application-review";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [applicationReviewRequested],
});
