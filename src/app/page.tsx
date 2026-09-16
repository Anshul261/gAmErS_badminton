import { redirect } from "next/navigation";
import { Courtside } from "@/components/courtside";
import { createClient } from "@/lib/supabase/server";
import type { Group } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  if (!identity?.claims.sub) redirect("/login");
  const { data, error } = await supabase
    .from("groups")
    .select("id,name,created_by,created_at,invite_expires_at")
    .order("created_at");
  if (error) throw new Error("Couldn't load your groups. Please try again.");
  return <Courtside initialGroups={data as Group[]} userId={identity.claims.sub} />;
}
