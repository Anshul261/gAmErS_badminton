import { createClient } from "@/lib/supabase/client";
import type { Game, GameInput, Player, PlayerStats, Session, SessionData, Workspace } from "./types";

async function author() {
  const { data, error } = await createClient().auth.getClaims();
  if (error || !data?.claims.sub) throw new Error("Your session expired. Sign in again.");
  return data.claims.sub;
}

function fail(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "23505") throw new Error("That name or active session already exists. Refresh and try again.", { cause: error.code });
  if (error.code === "42501") throw new Error("You no longer have permission to do that. Sign in again.", { cause: error.code });
  throw new Error(error.message, { cause: error.code });
}

export async function loadWorkspace(): Promise<Workspace> {
  const supabase = createClient();
  const [players, sessions, profiles] = await Promise.all([
    supabase.from("players").select("*").order("display_name"),
    supabase.from("sessions").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("profiles").select("user_id,display_name"),
  ]);
  fail(players.error);
  fail(sessions.error);
  fail(profiles.error);
  return {
    players: players.data as Player[],
    sessions: sessions.data as Session[],
    attendance: await loadAttendance(sessions.data as Session[]),
    profiles: Object.fromEntries(profiles.data!.map((row) => [row.user_id, row.display_name])),
  };
}

export async function ensureProfile(name: string): Promise<void> {
  const user_id = await author();
  // First sign-in: claim a default name without overwriting one chosen earlier.
  const { error } = await createClient().from("profiles").upsert({ user_id, display_name: name.trim().slice(0, 32) || "Friend" }, { onConflict: "user_id", ignoreDuplicates: true });
  fail(error);
}

export async function updateProfile(name: string): Promise<string> {
  const user_id = await author();
  const { data, error } = await createClient().from("profiles").update({ display_name: name.trim() }).eq("user_id", user_id).select("display_name").single();
  fail(error);
  return data!.display_name;
}

async function loadAttendance(sessions: Session[]): Promise<Record<string, string[]>> {
  const attendance: Record<string, string[]> = {};
  if (!sessions.length) return attendance;
  const rows = await createClient().from("session_players").select("session_id,player_id").in("session_id", sessions.map((session) => session.id));
  fail(rows.error);
  for (const row of rows.data!) (attendance[row.session_id] ??= []).push(row.player_id);
  return attendance;
}

export async function loadOlderSessions(before: string): Promise<{ sessions: Session[]; attendance: Record<string, string[]> }> {
  const { data, error } = await createClient().from("sessions").select("*")
    .lt("created_at", before).order("created_at", { ascending: false }).limit(50);
  fail(error);
  return { sessions: data as Session[], attendance: await loadAttendance(data as Session[]) };
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

export async function addPlayer(name: string): Promise<Player> {
  const created_by = await author();
  const { data, error } = await createClient().from("players").insert({ display_name: name.trim(), created_by }).select().single();
  fail(error);
  return data as Player;
}

export async function archivePlayer(playerId: string): Promise<void> {
  const created_by = await author();
  const { error, data } = await createClient().from("players").update({ archived: true, created_by }).eq("id", playerId).select("id").single();
  fail(error);
  if (!data) throw new Error("Player no longer exists.");
}

export type SessionPlan = { attendees: string[]; target: number; date: string; time: string; venue: string; mapUrl: string };

export async function startSession(plan: SessionPlan): Promise<string> {
  const { data, error } = await createClient().rpc("start_session", {
    attendees: plan.attendees, points: plan.target, on_date: plan.date,
    at_time: plan.time || undefined, venue: plan.venue.trim() || undefined, map_url: plan.mapUrl.trim() || undefined,
  });
  fail(error);
  return data!;
}

export async function addAttendee(session: Session, playerId: string): Promise<void> {
  const created_by = await author();
  const { error } = await createClient().from("session_players").insert({ session_id: session.id, player_id: playerId, created_by });
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

export async function reopenSession(sessionId: string): Promise<void> {
  const created_by = await author();
  const { data, error } = await createClient().from("sessions").update({ ended_at: null, created_by }).eq("id", sessionId).select("id").maybeSingle();
  fail(error);
  if (!data) throw new Error("This session no longer exists.");
}

export type SessionChanges = Pick<Session, "session_date" | "target_score" | "start_time" | "venue_name" | "venue_url">;

export async function updateSession(sessionId: string, changes: SessionChanges): Promise<Session> {
  const created_by = await author();
  const { data, error } = await createClient().from("sessions").update({ ...changes, created_by }).eq("id", sessionId).select().maybeSingle();
  fail(error);
  if (!data) throw new Error("This session no longer exists.");
  return data as Session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  // Cascades to attendance and games, so stats drop the whole session at once.
  const { error } = await createClient().from("sessions").delete().eq("id", sessionId).select("id").single();
  fail(error);
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

export async function loadStats(): Promise<PlayerStats[]> {
  const { data, error } = await createClient().rpc("player_stats");
  fail(error);
  return data!;
}
