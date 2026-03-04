import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { FundsList } from "./FundsList";

export default async function FundsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: rawFunds } = await supabase
    .from("funds")
    .select("id, name, organisation_id, organisations(id, name), url, published, created_at")
    .eq("created_by", user.id)
    .eq("creator_hidden", false)
    .order("created_at", { ascending: false });

  // Normalise Supabase join shape → { organisation: { id, name } | null }
  const funds = (rawFunds ?? []).map((f) => {
    const org = f.organisations as unknown as { id: string; name: string } | null;
    return { ...f, organisation: org };
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">My Funds</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Funds you have created. Published funds are visible to all users.
      </p>
      <FundsList funds={funds ?? []} />
    </div>
  );
}
