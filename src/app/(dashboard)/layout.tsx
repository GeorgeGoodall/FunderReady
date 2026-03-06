import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, subscription_tier, is_admin")
    .eq("id", user.id)
    .single();

  return (
    <DashboardShell
      displayName={profile?.display_name ?? user.email ?? "User"}
      tier={profile?.subscription_tier ?? "free"}
      isAdmin={profile?.is_admin ?? false}
    >
      {children}
    </DashboardShell>
  );
}
