import type { Tables } from "./database.types";

export type Player = Tables<"players">;
export type Session = Tables<"sessions">;
export type Game = Tables<"games">;
export type GameInput = Omit<Game, "created_by" | "created_at">;

export type Workspace = {
  players: Player[];
  sessions: Session[];
  /** Attendance for every loaded session, so lists can show who was on court. */
  attendance: Record<string, string[]>;
  /** Account display names by user id, for "logged by" tags. */
  profiles: Record<string, string>;
};

export type SessionData = {
  session: Session;
  playerIds: string[];
  games: Game[];
};

export type PlayerStats = {
  player_id: string;
  played: number;
  wins: number;
  losses: number;
  singles: number;
  solo: number;
  pair: number;
  doubles: number;
  points_for: number;
  points_against: number;
};

/** A game with its session's calendar day, for per-player dashboards. */
export type StatGame = Pick<Game, "id" | "created_at" | "session_id" | "score_a" | "score_b" | "target_score" | "side_a_player_1" | "side_a_player_2" | "side_b_player_1" | "side_b_player_2"> & {
  session_date: string;
};
