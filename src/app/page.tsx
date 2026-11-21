import { redirect } from "next/navigation";
import { Courtside } from "@/components/courtside";
import { ConfirmProvider } from "@/components/court/confirm";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  if (!identity?.claims.sub) redirect("/login");
  const email = typeof identity.claims.email === "string" ? identity.claims.email : "";
  const defaultName = email.split("@")[0].replace(/[._-]+/g, " ").trim() || "Friend";
  return <ConfirmProvider><Courtside userId={identity.claims.sub} defaultName={defaultName} /></ConfirmProvider>;
}
