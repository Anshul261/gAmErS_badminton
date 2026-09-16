import { createClient } from "@/lib/supabase/client";
import type { Game, GameInput, Group, Member, Player, PlayerStats, Session, SessionData, Workspace } from "./types";

const groupColumns = "id,name,created_by,created_at,invite_expires_at";

async function author() {
  const { data, error } = await createClient().auth.getClaims();
  if (error || !data?.claims.sub) throw new Error("Your session expired. Sign in again.");
  return data.claims.sub;
}

function fail(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "23505") throw new Error("That name or active session already exists. Refresh and try again.", { cause: error.code });
  if (error.code === "42501") throw new Error("You no longer have permission to do that. Check your group membership.", { cause: error.code });
  throw new Error(error.message, { cause: error.code });
}

export async function listGroups(): Promise<Group[]> {
  const { data, error } = await createClient().from("groups").select(groupColumns).order("created_at");
  fail(error);
  return data as Group[];
}

export async function createGroup(name: string): Promise<{ group_id: string; invite_code: string }> {
  const { data, error } = await createClient().rpc("create_group", { group_name: name.trim() });
  fail(error);
  return data as { group_id: string; invite_code: string };
}

export async function joinGroup(code: string): Promise<string> {
  const { data, error } = await createClient().rpc("join_group", { invite_code: code.trim() });
  fail(error);
  return data!;
}

export async function rotateInvite(groupId: string): Promise<string> {
  const { data, error } = await createClient().rpc("rotate_invite", { gid: groupId });
  fail(error);
  return data!;
}

export async function loadWorkspace(groupId: string): Promise<Workspace> {
  const supabase = createClient();
  const [group, players, sessions, members] = await Promise.all([
    supabase.from("groups").select(groupColumns).eq("id", groupId).single(),
    supabase.from("players").select("*").eq("group_id", groupId).order("display_name"),
    supabase.from("sessions").select("*").eq("group_id", groupId).order("created_at", { ascending: false }).limit(50),
    supabase.from("group_members").select("*").eq("group_id", groupId),
  ]);
  [group, players, sessions, members].forEach((result) => fail(result.error));
  return { group: group.data as Group, players: players.data as Player[], sessions: sessions.data as Session[], members: members.data as Member[] };
}

export async function loadOlderSessions(groupId: string, before: string): Promise<Session[]> {
  const { data, error } = await createClient().from("sessions").select("*").eq("group_id", groupId)
    .lt("created_at", before).order("created_at", { ascending: false }).limit(50);
  fail(error);
  return data as Session[];
}

export async function loadSession(sessionId: string): Promise<SessionData> {
  const supabase = createClient();
  const [session, attendance] = await Promise.all([
    supabase.from("sessions").select("*").eq("id", sessionId).single(),
    supabase.from("session_players").select("player_id").eq("session_id", sessionId),
  ]);
  fail(session.error);
  fail(attendance.error);
  const games: Game[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("games").select("*").eq("session_id", sessionId)
      .order("created_at", { ascending: true }).order("id").range(offset, offset + 999);
    fail(error);
    games.push(...data as Game[]);
    if (data!.length < 1000) break;
  }
  return { session: session.data as Session, playerIds: attendance.data!.map((row) => row.player_id), games };
}

export async function addPlayer(groupId: string, name: string): Promise<Player> {
  const created_by = await author();
  const { data, error } = await createClient().from("players").insert({ group_id: groupId, display_name: name.trim(), created_by }).select().single();
  fail(error);
  return data as Player;
}

export async function archivePlayer(playerId: string): Promise<void> {
  const created_by = await author();
  const { error, data } = await createClient().from("players").update({ archived: true, created_by }).eq("id", playerId).select("id").single();
  fail(error);
  if (!data) throw new Error("Player no longer exists.");
}

export async function startSession(groupId: string, playerIds: string[], target: number): Promise<string> {
  const { data, error } = await createClient().rpc("start_session", { gid: groupId, attendees: playerIds, points: target });
  fail(error);
  return data!;
}

export async function addAttendee(session: Session, playerId: string): Promise<void> {
  const created_by = await author();
  const { error } = await createClient().from("session_players").insert({ session_id: session.id, group_id: session.group_id, player_id: playerId, created_by });
  if (error?.code !== "23505") fail(error);
}

export async function endSession(sessionId: string): Promise<void> {
  const created_by = await author();
  const supabase = createClient();
  const { data, error } = await supabase.from("sessions").update({ ended_at: new Date().toISOString(), created_by })
    .eq("id", sessionId).is("ended_at", null).select("id").maybeSingle();
  fail(error);
  if (!data) {
    const ended = await supabase.from("sessions").select("ended_at").eq("id", sessionId).single();
    fail(ended.error);
    if (!ended.data?.ended_at) throw new Error("Couldn't finish the session. Please refresh and try again.");
  }
}

export async function saveGame(input: GameInput, original?: Game): Promise<Game> {
  const created_by = await author();
  const supabase = createClient();
  let query = supabase.from("games").update({ ...input, created_by }).eq("id", input.id);
  if (original) {
    // Only replace the version shown in the editor, not another phone's correction.
    for (const [field, value] of Object.entries(original)) {
      query = query.filter(field, value === null ? "is" : "eq", value);
    }
  }
  const result = original
    ? await query.select().maybeSingle()
    : await supabase.from("games").insert({ ...input, created_by }).select().single();
  if (result.data) return result.data;
  // A timed-out write may have committed, even if a session has since ended.
  const existing = await supabase.from("games").select("*").eq("id", input.id).maybeSingle();
  if (existing.data) {
    const game = existing.data;
    if (Object.entries(input).every(([field, value]) => game[field as keyof Game] === value)) return game;
    throw new Error("This game changed on another phone. Close the editor and open the latest result.");
  }
  fail(result.error);
  fail(existing.error);
  throw new Error("This game was removed. Refresh the session before trying again.");
}

export async function deleteGame(id: string): Promise<void> {
  const { error } = await createClient().from("games").delete().eq("id", id).select("id").single();
  fail(error);
}

export async function loadStats(groupId: string): Promise<PlayerStats[]> {
  const { data, error } = await createClient().rpc("player_stats", { gid: groupId });
  fail(error);
  return data!;
}

export async function leaveGroup(groupId: string, userId: string): Promise<void> {
  const { error } = await createClient().from("group_members").delete().eq("group_id", groupId).eq("user_id", userId).select("user_id").single();
  fail(error);
}
