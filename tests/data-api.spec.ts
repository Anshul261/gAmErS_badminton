import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("the public Data API keeps anonymous users out and enforces scores", async () => {
  const url = process.env.TEST_SUPABASE_URL!;
  const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY!;
  const anonymous = createClient(url, key, { auth: { persistSession: false } });
  const [owner, friend] = await Promise.all(["owner", "friend"].map(async (name) => {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const signup = await client.auth.signUp({ email: `${name}-${crypto.randomUUID()}@example.com`, password: "test-password-123" });
    expect(signup.error).toBeNull();
    return { client, id: signup.data.user!.id };
  }));
  const suffix = crypto.randomUUID().slice(0, 8);
  const players = await owner.client.from("players").insert([
    { display_name: `A ${suffix}`, created_by: owner.id },
    { display_name: `B ${suffix}`, created_by: owner.id },
    { display_name: `C ${suffix}`, created_by: owner.id },
  ]).select();
  expect(players.error).toBeNull();
  const ids = players.data!.map((p) => p.id);
  try {
    const session = await owner.client.rpc("start_session", { attendees: ids, points: 11 });
    expect(session.error).toBeNull();

    const game = {
      id: crypto.randomUUID(), session_id: session.data, target_score: 11,
      side_a_player_1: ids[0], side_a_player_2: null,
      side_b_player_1: ids[1], side_b_player_2: ids[2],
      score_a: 13, score_b: 11, created_by: friend.id,
    };
    // Any signed-in friend shares the court without joining anything.
    expect((await friend.client.from("games").insert(game)).error).toBeNull();
    const stats = await friend.client.rpc("player_stats");
    expect(stats.error).toBeNull();
    expect(stats.data.find((row: { player_id: string }) => row.player_id === ids[0])).toMatchObject({ played: 1, wins: 1, losses: 0, solo: 1, pair: 0, points_for: 13, points_against: 11 });
    // A solo 1v2 win against unknown opponents is worth more than an even win.
    expect(Number(stats.data.find((row: { player_id: string }) => row.player_id === ids[0]).score)).toBeGreaterThan(1);
    const values = await friend.client.rpc("session_game_values", { sid: session.data });
    expect(values.error).toBeNull();
    expect(values.data).toHaveLength(3);
    expect((await anonymous.rpc("player_stats")).error).not.toBeNull();
    expect((await anonymous.rpc("game_values")).error).not.toBeNull();
    expect((await anonymous.rpc("start_session", { attendees: ids, points: 11 })).error).not.toBeNull();
    for (const table of ["players", "sessions", "session_players", "games"]) {
      const unauthenticated = await anonymous.from(table).select("*");
      expect(unauthenticated.error, `anonymous read ${table}`).not.toBeNull();
      expect((await anonymous.from(table).delete().neq("created_by", crypto.randomUUID())).error, `anonymous delete ${table}`).not.toBeNull();
    }
    // Writes are attributed to the caller; nobody can sign as someone else.
    expect((await friend.client.from("games").insert({ ...game, id: crypto.randomUUID(), created_by: owner.id })).error).not.toBeNull();
    expect((await friend.client.from("players").update({ display_name: `Z ${suffix}` }).eq("id", ids[0])).error).not.toBeNull();
    for (const [a, b] of [[11, 11], [11, 10], [13, 10], [10, 8]]) {
      const invalid = await friend.client.from("games").insert({ ...game, id: crypto.randomUUID(), score_a: a, score_b: b });
      expect(invalid.error, `invalid score ${a}-${b}`).not.toBeNull();
    }
    expect((await friend.client.from("games").select("id").eq("session_id", session.data)).data).toHaveLength(1);
    expect((await friend.client.from("sessions").update({ ended_at: new Date().toISOString(), created_by: friend.id }).eq("id", session.data)).error).toBeNull();
    expect((await owner.client.from("games").insert({ ...game, id: crypto.randomUUID(), created_by: owner.id })).error).not.toBeNull();
  } finally {
    // Deleting players cascades attendance and games, so the shared local court stays tidy.
    expect((await owner.client.from("players").delete().in("id", ids)).error).toBeNull();
  }
});
