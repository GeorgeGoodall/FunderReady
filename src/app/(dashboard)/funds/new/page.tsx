import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NewFundPageClient } from "./NewFundPageClient";

export default async function NewFundPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  if (profile?.subscription_tier !== "pro") {
    redirect("/funds");
  }

  return <NewFundPageClient />;
}
