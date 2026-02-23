import { inngest } from "./client";

export const reviewSubmitted = inngest.createFunction(
  {
    id: "review-submitted",
    concurrency: { key: "event.data.userId", limit: 1 },
  },
  { event: "review/submitted" },
  async ({ event, step }) => {
    const { reviewId, userId } = event.data;

    await step.run("log-receipt", async () => {
      console.log(`[review/submitted] reviewId=${reviewId} userId=${userId}`);
      // Pipeline steps will be added in Phase 3
    });

    return { reviewId, status: "placeholder" };
  }
);
