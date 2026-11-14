import type { SupabaseClient } from "@supabase/supabase-js";

type SessionAuth = Pick<SupabaseClient["auth"], "getSession" | "refreshSession">;

/** Recover expired Data API requests before a transient rejection reaches the UI. */
export function sessionFetch(url: string, auth: () => SessionAuth, fetcher: typeof fetch = fetch): typeof fetch {
  const origin = new URL(url).origin;
  let recovery: Promise<string | null> | null = null;

  async function recover(authorization: string | null): Promise<string | null> {
    const client = auth();
    const current = await client.getSession();
    if (!current.data.session) return null;
    const token = current.data.session.access_token;
    // Another request or tab may have renewed the token while this response was in flight.
    if (!current.error && `Bearer ${token}` !== authorization) return token;
    const refreshed = await client.refreshSession();
    return refreshed.error ? null : refreshed.data.session?.access_token ?? null;
  }

  return async (input, init) => {
    const target = new URL(input instanceof Request ? input.url : String(input));
    if (target.origin !== origin || !target.pathname.startsWith("/rest/v1/")) {
      return fetcher(input, init);
    }

    const request = new Request(input, init);
    // Keep the original body for a retry. A JWT rejection occurs before the database write.
    const response = await fetcher(request.clone());
    if (response.status !== 401) return response;
    const error = await response.clone().json().catch(() => null);
    if (error?.code !== "PGRST303" || typeof error.message !== "string" || !/jwt expired/i.test(error.message)) return response;

    recovery ??= recover(request.headers.get("Authorization"));
    const pending = recovery;
    let token: string | null;
    try {
      token = await pending;
    } catch {
      return response;
    } finally {
      if (recovery === pending) recovery = null;
    }
    if (!token || request.signal.aborted) return response;
    request.headers.set("Authorization", `Bearer ${token}`);
    return fetcher(request);
  };
}
