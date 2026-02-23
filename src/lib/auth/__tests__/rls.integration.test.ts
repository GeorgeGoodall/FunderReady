import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// These tests run against the hosted Supabase project.
// They verify RLS policies prevent cross-user data access.
// Requires SUPABASE_SERVICE_ROLE_KEY to set up test data.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const canRun = !!(supabaseUrl && serviceRoleKey && anonKey);

describe.skipIf(!canRun)("RLS policies", () => {
  let admin: SupabaseClient;
  let userAId: string;
  let userBId: string;
  let userAEmail: string;
  let userBEmail: string;
  let userAReviewId: string;

  beforeAll(async () => {
    admin = createClient(supabaseUrl!, serviceRoleKey!);

    // Create two test users via admin API
    const ts = Date.now();
    userAEmail = `test-a-${ts}@rls-test.example.com`;
    userBEmail = `test-b-${ts}@rls-test.example.com`;

    const { data: userA } = await admin.auth.admin.createUser({
      email: userAEmail,
      password: "testpassword123",
      email_confirm: true,
    });
    const { data: userB } = await admin.auth.admin.createUser({
      email: userBEmail,
      password: "testpassword123",
      email_confirm: true,
    });

    userAId = userA.user!.id;
    userBId = userB.user!.id;

    // Create a review for user A (via service role, bypasses RLS)
    const { data: review } = await admin
      .from("reviews")
      .insert({
        user_id: userAId,
        bid_file_name: "rls-test.docx",
        bid_file_path: `${userAId}/rls-test.docx`,
      })
      .select("id")
      .single();

    userAReviewId = review!.id;

    // Create a review_results row
    await admin.from("review_results").insert({
      review_id: userAReviewId,
      progress: { step: "test" },
    });

    // Create a usage row for user A
    await admin.from("usage").insert({
      user_id: userAId,
      period: "2099-01",
      reviews_used: 1,
      reviews_limit: 3,
    });
  });

  afterAll(async () => {
    if (!admin) return;
    // Clean up test users (cascade deletes profiles, reviews, etc.)
    await admin.auth.admin.deleteUser(userAId);
    await admin.auth.admin.deleteUser(userBId);
  });

  async function clientAs(email: string) {
    const client = createClient(supabaseUrl!, anonKey!);
    await client.auth.signInWithPassword({ email, password: "testpassword123" });
    return client;
  }

  it("user A can see their own profile", async () => {
    const client = await clientAs(userAEmail);
    const { data } = await client.from("profiles").select("id").eq("id", userAId);
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(userAId);
  });

  it("user B cannot see user A's profile", async () => {
    const client = await clientAs(userBEmail);
    const { data } = await client.from("profiles").select("id").eq("id", userAId);
    expect(data).toHaveLength(0);
  });

  it("user A can see their own reviews", async () => {
    const client = await clientAs(userAEmail);
    const { data } = await client.from("reviews").select("id");
    expect(data!.length).toBeGreaterThanOrEqual(1);
    expect(data!.some((r) => r.id === userAReviewId)).toBe(true);
  });

  it("user B cannot see user A's reviews", async () => {
    const client = await clientAs(userBEmail);
    const { data } = await client.from("reviews").select("id").eq("id", userAReviewId);
    expect(data).toHaveLength(0);
  });

  it("user A can see their own review_results", async () => {
    const client = await clientAs(userAEmail);
    const { data } = await client
      .from("review_results")
      .select("review_id")
      .eq("review_id", userAReviewId);
    expect(data).toHaveLength(1);
  });

  it("user B cannot see user A's review_results", async () => {
    const client = await clientAs(userBEmail);
    const { data } = await client
      .from("review_results")
      .select("review_id")
      .eq("review_id", userAReviewId);
    expect(data).toHaveLength(0);
  });

  it("user A can see their own usage", async () => {
    const client = await clientAs(userAEmail);
    const { data } = await client.from("usage").select("*").eq("user_id", userAId);
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });

  it("user B cannot see user A's usage", async () => {
    const client = await clientAs(userBEmail);
    const { data } = await client.from("usage").select("*").eq("user_id", userAId);
    expect(data).toHaveLength(0);
  });
});
