import { redirect } from "next/navigation";
import { Courtside } from "@/components/courtside";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  if (!identity?.claims.sub) redirect("/login");
  return <Courtside />;
}
