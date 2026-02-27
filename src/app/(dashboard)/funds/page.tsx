import { createClient } from "@/lib/supabase/server";
import { FundsList } from "./FundsList";

export default async function FundsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: funds } = await supabase
    .from("funds")
    .select("id, name, funder_organisation, url, published, created_at")
    .eq("created_by", user!.id)
    .eq("creator_hidden", false)
    .order("created_at", { ascending: false });

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
