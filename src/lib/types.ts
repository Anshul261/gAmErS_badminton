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
  /** Score value of each game per player id, from the strength-adjusted leaderboard pass. */
  values: Record<string, Record<string, number>>;
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
  score: number;
};
