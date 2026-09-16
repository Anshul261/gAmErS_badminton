import type { Tables } from "./database.types";

export type Group = Pick<Tables<"groups">, "id" | "name" | "created_by" | "created_at" | "invite_expires_at">;
export type Player = Tables<"players">;
export type Session = Tables<"sessions">;
export type Member = Omit<Tables<"group_members">, "role"> & {
  role: "admin" | "member";
};
export type Game = Tables<"games">;
export type GameInput = Omit<Game, "created_by" | "created_at">;

export type Workspace = {
  group: Group;
  players: Player[];
  sessions: Session[];
  members: Member[];
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
  points_for: number;
  points_against: number;
};
