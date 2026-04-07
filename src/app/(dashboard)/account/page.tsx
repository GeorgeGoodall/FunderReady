import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AccountClient } from "./AccountClient";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return (
    <AccountClient
      email={user.email ?? ""}
      displayName={profile?.display_name ?? ""}
    />
  );
}
