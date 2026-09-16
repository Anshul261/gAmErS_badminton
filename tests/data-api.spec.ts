import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("the public Data API keeps outsiders out and enforces scores", async () => {
  const url = process.env.TEST_SUPABASE_URL!;
  const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY!;
  const anonymous = createClient(url, key, { auth: { persistSession: false } });
  const clients = await Promise.all(["owner", "friend", "outsider"].map(async (name) => {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const signup = await client.auth.signUp({ email: `${name}-${crypto.randomUUID()}@example.com`, password: "test-password-123" });
    expect(signup.error).toBeNull();
    return { client, id: signup.data.user!.id };
  }));
  const [owner, friend, outsider] = clients;
  const created = await owner.client.rpc("create_group", { group_name: "API security test" });
  expect(created.error).toBeNull();
  const groupId = created.data.group_id as string;
  const inviteCode = created.data.invite_code as string;
  expect(inviteCode).toMatch(/^[0-9a-f]{64}$/);

  const joined = await friend.client.rpc("join_group", { invite_code: inviteCode });
  expect(joined.error).toBeNull();
  expect(joined.data).toBe(groupId);
  const players = await owner.client.from("players").insert([
    { group_id: groupId, display_name: "A", created_by: owner.id },
    { group_id: groupId, display_name: "B", created_by: owner.id },
    { group_id: groupId, display_name: "C", created_by: owner.id },
  ]).select();
  expect(players.error).toBeNull();
  const session = await owner.client.rpc("start_session", { gid: groupId, attendees: players.data!.map((p) => p.id), points: 11 });
  expect(session.error).toBeNull();

  const game = {
    id: crypto.randomUUID(), session_id: session.data, target_score: 11,
    side_a_player_1: players.data![0].id, side_a_player_2: null,
    side_b_player_1: players.data![1].id, side_b_player_2: players.data![2].id,
    score_a: 13, score_b: 11, created_by: friend.id,
  };
  expect((await friend.client.from("games").insert(game)).error).toBeNull();
  const stats = await friend.client.rpc("player_stats", { gid: groupId });
  expect(stats.error).toBeNull();
  expect(stats.data).toHaveLength(3);
  expect(stats.data.find((row: { player_id: string }) => row.player_id === players.data![0].id)).toMatchObject({ played: 1, wins: 1, points_for: 13, points_against: 11 });
  expect((await outsider.client.rpc("player_stats", { gid: groupId })).data).toEqual([]);
  expect((await anonymous.rpc("player_stats", { gid: groupId })).error).not.toBeNull();
  for (const table of ["groups", "group_members", "players", "sessions", "session_players", "games"]) {
    const leaked = await outsider.client.from(table).select("*");
    expect(leaked.error).toBeNull();
    expect(leaked.data, `outsider read ${table}`).toEqual([]);
    const unauthenticated = await anonymous.from(table).select("*");
    expect(unauthenticated.error || unauthenticated.data?.length === 0).toBeTruthy();
  }
  expect((await outsider.client.from("group_members").insert({ group_id: groupId, user_id: outsider.id, role: "admin", created_by: outsider.id })).error).not.toBeNull();
  expect((await friend.client.rpc("rotate_invite", { gid: groupId })).error).not.toBeNull();
  expect((await friend.client.from("games").insert({ ...game, id: crypto.randomUUID(), created_by: owner.id })).error).not.toBeNull();
  for (const [a, b] of [[11, 11], [11, 10], [13, 10], [10, 8]]) {
    const invalid = await friend.client.from("games").insert({ ...game, id: crypto.randomUUID(), score_a: a, score_b: b });
    expect(invalid.error, `invalid score ${a}-${b}`).not.toBeNull();
  }
  const before = await friend.client.from("games").select("id").eq("session_id", session.data);
  expect(before.data).toHaveLength(1);
  expect((await owner.client.from("group_members").delete().eq("group_id", groupId).eq("user_id", friend.id)).error).toBeNull();
  expect((await friend.client.from("games").select("*")).data).toEqual([]);
  expect((await owner.client.from("groups").delete().eq("id", groupId)).error).toBeNull();
});
