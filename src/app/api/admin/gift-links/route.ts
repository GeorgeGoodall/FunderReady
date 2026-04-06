import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { randomBytes } from "crypto";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function deriveStatus(link: {
  redeemed_at: string | null;
  expires_at: string | null;
}): "active" | "used" | "expired" {
  if (link.redeemed_at) return "used";
  if (link.expires_at && new Date(link.expires_at) < new Date()) return "expired";
  return "active";
}

export async function GET(_request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { serviceClient } = auth;

  const { data: links, error } = await serviceClient
    .from("gift_links")
    .select("id, code, credits, created_by, created_at, expires_at, redeemed_by, redeemed_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = links ?? [];

  const redeemedIds = rows
    .map((r) => r.redeemed_by)
    .filter((id): id is string => !!id);

  const emailMap: Record<string, string> = {};
  if (redeemedIds.length > 0) {
    try {
      const { data: { users } } = await serviceClient.auth.admin.listUsers({ perPage: 1000 });
      for (const u of users) {
        if (redeemedIds.includes(u.id)) {
          emailMap[u.id] = u.email ?? "";
        }
      }
    } catch {
      // Non-fatal — emails stay empty
    }
  }

  const result = rows.map((link) => ({
    ...link,
    status: deriveStatus(link),
    redeemed_by_email: link.redeemed_by ? (emailMap[link.redeemed_by] ?? "") : null,
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { serviceClient, userId } = auth;

  const body = await request.json().catch(() => ({}));
  const credits = Number(body.credits);
  const expiresAt: string | undefined = body.expires_at;

  if (!Number.isInteger(credits) || credits < 1 || credits > 100) {
    return NextResponse.json(
      { error: "credits must be an integer between 1 and 100" },
      { status: 400 }
    );
  }

  const code = randomBytes(16).toString("hex");

  const row: Record<string, unknown> = {
    code,
    credits,
    created_by: userId,
  };
  if (expiresAt) {
    row.expires_at = expiresAt;
  }

  const { data, error } = await serviceClient
    .from("gift_links")
    .insert(row)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    code: data.code,
    url: `${APP_URL}/redeem?code=${data.code}`,
  });
}
