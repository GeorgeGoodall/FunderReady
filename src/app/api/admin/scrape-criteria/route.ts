import { createClient, createServiceClient } from "@/lib/supabase/server";
import { crawlForCriteria, type CrawlProgress } from "@/lib/scraping/crawl-criteria";
import { z } from "zod";

const RequestSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
});

// Simple concurrency guard — only one scrape at a time
let activeScrape = false;

export async function POST(request: Request) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Admin check
  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse request
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: parsed.error.errors[0]?.message ?? "Invalid request",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Concurrency check
  if (activeScrape) {
    return new Response(
      JSON.stringify({ error: "A scrape is already in progress. Please wait for it to finish." }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const { url } = parsed.data;

  // AbortController to stop crawling when client disconnects
  const abortController = new AbortController();

  // Set up SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      activeScrape = true;

      function sendEvent(event: string, data: unknown) {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Controller may be closed if client disconnected
          abortController.abort();
        }
      }

      try {
        const result = await crawlForCriteria(url, {
          userId: user.id,
          signal: abortController.signal,
          onProgress: (progress: CrawlProgress) => {
            sendEvent("progress", progress);
          },
        });

        sendEvent("complete", {
          content: result.content,
          pagesScraped: result.pagesScraped,
          urls: result.urls,
          usage: result.usage,
          pageTree: result.pageTree,
        });
      } catch (error) {
        if (!abortController.signal.aborted) {
          sendEvent("error", {
            message:
              error instanceof Error
                ? error.message
                : "An unexpected error occurred while scraping.",
          });
        }
      } finally {
        activeScrape = false;
        controller.close();
      }
    },
    cancel() {
      // Client disconnected — abort the crawl
      abortController.abort();
      activeScrape = false;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
