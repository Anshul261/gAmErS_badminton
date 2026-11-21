"use client";

import { createContext, useContext } from "react";
import type { Game, SessionData, Workspace } from "@/lib/types";

export type Tab = "play" | "history" | "stats" | "people" | "faq";

/** Values that more than one tab needs. Courtside builds it once the workspace has loaded. */
export type Court = {
  userId: string;
  workspace: Workspace; // tabs render only once it's loaded
  names: Map<string, string>;
  locked: boolean;
  offline: boolean;
  busy: string;
  mutate: (label: string, task: () => Promise<void>, success: string) => Promise<void>;
  setError: (message: string) => void;
  setTab: (tab: Tab) => void;
  setProfileId: (id: string | null) => void;
  setEditingGame: (game: Game | null) => void;
  setSessions: React.Dispatch<React.SetStateAction<Record<string, SessionData>>>;
  setWorkspace: React.Dispatch<React.SetStateAction<Workspace | null>>;
  refresh: () => void; // calls refresh.current()
  frozen: (date: string) => boolean;
};

const CourtContext = createContext<Court | null>(null);
export const CourtProvider = CourtContext.Provider;
export function useCourt() {
  const court = useContext(CourtContext);
  if (!court) throw new Error("useCourt must be used inside CourtProvider.");
  return court;
}
