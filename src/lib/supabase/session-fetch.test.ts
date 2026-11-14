import { describe, expect, it, vi } from "vitest";
import { sessionFetch } from "./session-fetch";

const origin = "https://example.supabase.co";
const expired = () => new Response(JSON.stringify({ code: "PGRST303", message: "JWT expired" }), { status: 401 });
const session = (access_token: string) => ({ data: { session: { access_token } }, error: null });

function setup() {
  const auth = {
    getSession: vi.fn().mockResolvedValue(session("old-token")),
    refreshSession: vi.fn().mockResolvedValue(session("new-token")),
  };
  const fetcher = vi.fn<typeof fetch>();
  const request = new Request(`${origin}/rest/v1/games`, {
    method: "POST",
    headers: { Authorization: "Bearer old-token", apikey: "publishable-key", "Content-Type": "application/json" },
    body: JSON.stringify({ id: "same-game-id", score_a: 11, score_b: 5 }),
  });
  return { auth, fetcher, request, fetch: sessionFetch(origin, () => auth, fetcher) };
}

describe("expired session recovery", () => {
  it("passes successful requests through without refreshing", async () => {
    const { auth, fetcher, request, fetch } = setup();
    const response = new Response("saved");
    fetcher.mockResolvedValue(response);
    expect(await fetch(request)).toBe(response);
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it("retries an expired JWT once with the fresh token and the identical write", async () => {
    const { auth, fetcher, request, fetch } = setup();
    const sent: Request[] = [];
    fetcher.mockImplementation(async (input) => {
      sent.push(input as Request);
      return sent.length === 1 ? expired() : new Response("saved");
    });
    expect((await fetch(request)).status).toBe(200);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(sent[0].headers.get("Authorization")).toBe("Bearer old-token");
    expect(sent[1].headers.get("Authorization")).toBe("Bearer new-token");
    expect(sent[1].headers.get("apikey")).toBe("publishable-key");
    expect(sent[1].method).toBe("POST");
    expect(await sent[0].text()).toBe(await sent[1].text());
  });

  it("shares recovery across simultaneous expired requests", async () => {
    const { auth, fetcher, request, fetch } = setup();
    let finish!: (value: ReturnType<typeof session>) => void;
    auth.refreshSession.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    fetcher.mockImplementation(async (input) => (input as Request).headers.get("Authorization") === "Bearer old-token" ? expired() : new Response("ok"));
    const results = [fetch(request.clone()), fetch(request.clone()), fetch(request.clone())];
    await vi.waitFor(() => expect(auth.refreshSession).toHaveBeenCalledTimes(1));
    finish(session("new-token"));
    expect((await Promise.all(results)).map((response) => response.status)).toEqual([200, 200, 200]);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("uses an already refreshed session for a late expired response", async () => {
    const { auth, fetcher, request, fetch } = setup();
    auth.getSession.mockResolvedValue(session("new-token"));
    fetcher.mockResolvedValueOnce(expired()).mockResolvedValueOnce(new Response("ok"));
    expect((await fetch(request)).status).toBe(200);
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect((fetcher.mock.calls[1][0] as Request).headers.get("Authorization")).toBe("Bearer new-token");
  });

  it("does not loop if the renewed token is rejected", async () => {
    const { auth, fetcher, request, fetch } = setup();
    fetcher.mockImplementation(async () => expired());
    expect((await fetch(request)).status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("keeps genuine refresh failures visible without retrying a write", async () => {
    const { auth, fetcher, request, fetch } = setup();
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: "Refresh token revoked" } });
    const response = expired();
    fetcher.mockResolvedValue(response);
    expect(await fetch(request)).toBe(response);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not restore a signed-out session", async () => {
    const { auth, fetcher, request, fetch } = setup();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    fetcher.mockResolvedValue(expired());
    expect((await fetch(request)).status).toBe(401);
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not refresh for permissions, invalid signatures or server errors", async () => {
    const { auth, fetcher, request, fetch } = setup();
    for (const [status, error] of [
      [403, { code: "42501", message: "permission denied" }],
      [401, { code: "PGRST303", message: "JWT signature is invalid" }],
      [500, { code: "PGRST303", message: "JWT expired" }],
    ] as const) {
      fetcher.mockResolvedValue(new Response(JSON.stringify(error), { status }));
      expect((await fetch(request.clone())).status).toBe(status);
    }
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("never applies recovery to Auth requests or another host", async () => {
    const { auth, fetcher, fetch } = setup();
    const bodies: string[] = [];
    fetcher.mockImplementation(async (input) => {
      if (input instanceof Request) bodies.push(await input.text());
      return expired();
    });
    await fetch(new Request(`${origin}/auth/v1/token`, { method: "POST", body: "refresh-body" }));
    await fetch("https://another.example/rest/v1/games");
    expect(bodies).toEqual(["refresh-body"]);
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});
