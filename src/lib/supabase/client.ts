import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";
import { sessionFetch } from "./session-fetch";
import type { Database } from "@/lib/database.types";

export function createClient() {
  const { url, key } = supabaseEnv();
  const client: SupabaseClient<Database> = createBrowserClient<Database>(url, key, {
    global: { fetch: sessionFetch(url, () => client.auth) },
  });
  return client;
}
