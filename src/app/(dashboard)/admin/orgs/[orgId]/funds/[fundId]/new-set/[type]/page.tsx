import { createServiceClient, createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { BreadcrumbLabels } from "@/components/Breadcrumbs";
import { AdminSetCreator } from "../../../../../../components/AdminSetCreator";

export const dynamic = "force-dynamic";

export default async function NewSetPage({
  params,
}: {
  params: Promise<{ orgId: string; fundId: string; type: string }>;
}) {
  const { orgId, fundId, type } = await params;

  if (type !== "criteria" && type !== "questions") notFound();

  // Auth guard — defense in depth (layout also checks)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) redirect("/dashboard");

  const [{ data: org }, { data: fund }] = await Promise.all([
    serviceClient
      .from("organisations")
      .select("id, name")
      .eq("id", orgId)
      .eq("rejected", false)
      .single(),
    serviceClient
      .from("funds")
      .select("id, name")
      .eq("id", fundId)
      .eq("rejected", false)
      .single(),
  ]);

  if (!org || !fund) notFound();

  const label = type === "criteria" ? "Criteria Set" : "Questions Set";

  return (
    <>
      <BreadcrumbLabels labels={{ [orgId]: org.name, [fundId]: fund.name, [type]: `New ${label}` }} />
      <div className="space-y-8">
        <h2 className="text-xl font-semibold">New {label}</h2>

        <AdminSetCreator
          setType={type}
          fundId={fundId}
          orgId={orgId}
        />
      </div>
    </>
  );
}
