"use client";

import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, CounterClockwiseClockIcon, ExitIcon, PlayIcon, ReloadIcon, BarChartIcon, PersonIcon, PauseIcon, Cross2Icon, QuestionMarkCircledIcon } from "@radix-ui/react-icons";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GameForm } from "@/components/game-form";
import { PlayerDashboard } from "@/components/player-dashboard";
import { CourtProvider, message, rememberSession, rememberedSession } from "@/components/court/context";
import type { Tab } from "@/components/court/context";
import { FaqTab } from "@/components/court/faq-tab";
import { HistoryTab } from "@/components/court/history-tab";
import type { Range } from "@/components/court/history-tab";
import { PeopleTab } from "@/components/court/people-tab";
import { PlayTab } from "@/components/court/play-tab";
import { StatsTab } from "@/components/court/stats-tab";
import { ensureProfile, loadAllGames, loadOlderSessions, loadSession, loadWorkspace, saveGame } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import { dubaiToday } from "@/lib/scoring";
import { inSeason, seasons } from "@/lib/seasons";
import type { Game, GameInput, Session, SessionData, StatGame, Workspace } from "@/lib/types";

const tabs = [{ id: "play", label: "Play", icon: PlayIcon }, { id: "history", label: "History", icon: CounterClockwiseClockIcon }, { id: "stats", label: "Stats", icon: BarChartIcon }, { id: "people", label: "People", icon: PersonIcon }, { id: "faq", label: "FAQ", icon: QuestionMarkCircledIcon }] as const;

export function Courtside({ userId, defaultName }: { userId: string; defaultName: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [sessions, setSessions] = useState<Record<string, SessionData>>({});
  const [playSessionId, setPlaySessionId] = useState<string | null>(null);
  const [historySessionId, setHistorySessionId] = useState<string | null>(null);
  const [olderSessions, setOlderSessions] = useState<Session[]>([]);
  const [olderAttendance, setOlderAttendance] = useState<Record<string, string[]>>({});
  const [hasOlder, setHasOlder] = useState(true);
  const [tab, setTab] = useState<Tab>("play");
  const [offline, setOffline] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [sessionErrors, setSessionErrors] = useState<Record<string, string>>({});
  const [seasonPick, setSeasonPick] = useState<number | "all">(() => seasons()[0].number);
  const [allGames, setAllGames] = useState<StatGame[] | null>(null);
  const [gamesError, setGamesError] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [gamePending, setGamePending] = useState(false);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [gameLimit, setGameLimit] = useState(50);
  const [choosing, setChoosing] = useState(false);
  const [range, setRange] = useState<Range>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const actionLock = useRef(false);
  const profileClaimed = useRef(false);
  const revision = useRef(0);
  const refresh = useRef<() => void>(() => {});
  const activeSessions = workspace?.sessions.filter((session) => !session.ended_at) ?? [];
  const playData = playSessionId ? sessions[playSessionId] : undefined;
  const selectedId = tab === "history" ? historySessionId : playSessionId;
  const selectedData = selectedId ? sessions[selectedId] : undefined;
  const names = new Map(workspace?.players.map((player) => [player.id, player.display_name]) ?? []);
  const attendance = { ...olderAttendance, ...workspace?.attendance };
  const isPlanned = (session: Session) => !session.ended_at && session.session_date > dubaiToday();
  const whoPlayed = (id: string) => (attendance[id] ?? []).map((playerId) => names.get(playerId) ?? "Archived player").sort((a, b) => a.localeCompare(b));
  const locked = Boolean(busy) || gamePending;
  const history = [...(workspace?.sessions ?? []), ...olderSessions].filter((session, index, all) => all.findIndex((item) => item.id === session.id) === index);
  const selectedError = selectedId ? sessionErrors[selectedId] : "";
  const rangeFrom = range === "today" ? dubaiToday() : range === "custom" ? customFrom : range === "all" ? "" : dubaiToday(Number(range) - 1);
  const rangeTo = range === "custom" ? customTo : "";
  const filteredHistory = history.filter((session) => (!rangeFrom || session.session_date >= rangeFrom) && (!rangeTo || session.session_date <= rangeTo));
  const oldestLoaded = history[history.length - 1];
  // Sessions load newest-first in pages of 50, so a range may reach past what is loaded.
  const rangeIncomplete = hasOlder && history.length >= 50 && (!rangeFrom || Boolean(oldestLoaded && oldestLoaded.session_date >= rangeFrom));
  const seasonList = useMemo(() => seasons(), []);
  const season = seasonPick === "all" ? null : seasonList.find((item) => item.number === seasonPick) ?? seasonList[0];
  // A finished season is final: its sessions can be viewed but not changed.
  const frozen = (date: string) => date < seasonList[0].from;
  const seasonGames = useMemo(() => allGames && season ? allGames.filter((game) => inSeason(season, game.session_date)) : allGames, [allGames, season]);
  const playEnded = Boolean(playData?.session.ended_at || workspace?.sessions.find((session) => session.id === playSessionId)?.ended_at);

  const poll = useEffectEvent(async (cancelled: () => boolean, workspaceDue: boolean) => {
    const readRevision = revision.current;
    const stale = () => cancelled() || readRevision !== revision.current;
    let currentWorkspace = workspace;
    if (workspaceDue || !currentWorkspace) {
      try {
        currentWorkspace = await loadWorkspace();
        if (stale()) return;
        if (!currentWorkspace.profiles[userId] && !profileClaimed.current) {
          profileClaimed.current = true;
          try {
            await ensureProfile(defaultName);
            if (stale()) return;
            currentWorkspace = { ...currentWorkspace, profiles: { ...currentWorkspace.profiles, [userId]: defaultName } };
          } catch { /* The name can be set under People; nothing else depends on it. */ }
        }
        const latestIds = new Set(currentWorkspace.sessions.map((session) => session.id));
        const displaced = workspace?.sessions.filter((session) => !latestIds.has(session.id)) ?? [];
        if (displaced.length) {
          setOlderSessions((current) => [...displaced, ...current]);
          setOlderAttendance((current) => ({ ...current, ...Object.fromEntries(displaced.map((session) => [session.id, workspace?.attendance[session.id] ?? []])) }));
        }
        setWorkspace(currentWorkspace);
        setWorkspaceError("");
        setError((current) => current.startsWith("Updates paused.") ? "" : current);
        // Land on the court this account was logging for, then the one it started, then the only one open.
        const open = currentWorkspace.sessions.filter((session) => !session.ended_at);
        const remembered = rememberedSession(userId);
        const mine = open.find((session) => session.id === remembered) ?? open.find((session) => session.created_by === userId) ?? (open.length === 1 ? open[0] : undefined);
        if (mine && !choosing) setPlaySessionId((current) => current ?? mine.id);
      } catch (cause) {
        if (stale()) return;
        const code = cause instanceof Error ? String(cause.cause ?? "") : "";
        const accessDenied = code === "42501" || code === "PGRST116" || code.startsWith("PGRST30");
        if (workspace && !accessDenied) {
          setError(`Updates paused. Your draft is still here. ${message(cause)}`);
          return;
        }
        // Hide records when sign-in is rejected, but retain drafts during network failures.
        setWorkspace(null);
        setSessions({});
        setAllGames(null);
        setProfileId(null);
        setOlderSessions([]);
        setOlderAttendance({});
        setEditingGame(null);
        setWorkspaceError(message(cause));
        return;
      }
    }
    if (!currentWorkspace || stale()) return;
    const id = selectedId;
    await Promise.all([
      id ? (async () => {
        try {
          const data = await loadSession(id);
          if (stale()) return;
          setSessions((current) => ({ ...current, [id]: data }));
          setSessionErrors((current) => ({ ...current, [id]: "" }));
        } catch (cause) {
          if (!stale()) setSessionErrors((current) => ({ ...current, [id]: message(cause) }));
        }
      })() : Promise.resolve(),
      workspaceDue && (tab === "stats" || profileId) ? (async () => {
        try {
          const data = await loadAllGames();
          if (stale()) return;
          setAllGames(data);
          setGamesError("");
        } catch (cause) {
          if (!stale()) setGamesError(message(cause));
        }
      })() : Promise.resolve(),
    ]);
  });
  const pollDelay = useEffectEvent(() => activeSessions.length ? 4000 : 15000);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let queued = false;
    let lastWorkspace = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function run(force = false) {
      clearTimeout(timer);
      if (cancelled || document.hidden || !navigator.onLine) return;
      if (inFlight) { queued ||= force; return; }
      inFlight = true;
      const workspaceDue = force || Date.now() - lastWorkspace >= 15000;
      await poll(() => cancelled, workspaceDue);
      if (workspaceDue) lastWorkspace = Date.now();
      inFlight = false;
      if (cancelled) return;
      const nextForce = queued;
      queued = false;
      timer = setTimeout(() => void run(nextForce), nextForce ? 0 : pollDelay());
    }
    function resume() {
      setOffline(!navigator.onLine);
      if (!document.hidden && navigator.onLine) void run(true);
      else clearTimeout(timer);
    }
    refresh.current = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void run(true), 0);
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    resume();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
    };
  }, []);

  useEffect(() => { refresh.current(); }, [selectedId, tab, profileId]);

  async function mutate(label: string, task: () => Promise<void>, success: string) {
    if (actionLock.current || offline) return;
    actionLock.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await task();
      revision.current += 1;
      setNotice(success);
      refresh.current();
    } catch (cause) {
      setError(message(cause));
    } finally {
      actionLock.current = false;
      setBusy("");
    }
  }

  async function save(input: GameInput, original?: Game) {
    if (actionLock.current) throw new Error("Another change is being saved. Try again in a moment.");
    actionLock.current = true;
    try {
      const game = await saveGame(input, original);
      revision.current += 1;
      setSessions((current) => {
        const data = current[game.session_id];
        if (!data) return current;
        const games = data.games.filter((item) => item.id !== game.id);
        games.push(game);
        games.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
        return { ...current, [game.session_id]: { ...data, games } };
      });
      setNotice(original ? "Game corrected." : "Game saved.");
      if (original) setEditingGame(null);
      // Refresh owns its errors. A recorded game must never look like a failed save.
      refresh.current();
    } finally { actionLock.current = false; }
  }

  function openSession(id: string) {
    if (playData && !playEnded && id !== playSessionId && !window.confirm("Open this session? Any unsaved draft for the current one will be lost.")) return false;
    setPlaySessionId(id);
    rememberSession(userId, id);
    setChoosing(false);
    setGameLimit(50);
    return true;
  }

  function chooseSession() {
    if (playData && !playEnded && !window.confirm("Leave this session? Any unsaved game draft will be lost.")) return;
    setPlaySessionId(null);
    rememberSession(userId, null);
    setChoosing(true);
    setAttendees([]);
    setGameLimit(50);
  }

  function loadMore() {
    void mutate("older", async () => {
      const last = history[history.length - 1];
      const result = await loadOlderSessions(last.created_at);
      setOlderSessions((current) => [...current, ...result.sessions]);
      setOlderAttendance((current) => ({ ...current, ...result.attendance }));
      setHasOlder(result.sessions.length === 50);
    }, "Older sessions loaded.");
  }

  // Keep paging until the chosen range is fully covered.
  const autoLoad = useEffectEvent(() => { if (tab === "history" && rangeFrom && rangeIncomplete && !locked && !offline) loadMore(); });
  useEffect(() => { autoLoad(); }, [tab, rangeFrom, history.length]);

  return (
    <div className="cs-app">
      <a className="cs-skip-link" href="#main">Skip to content</a>
      <header className="cs-header">
        <button type="button" className="cs-brand" onClick={() => setTab("play")} aria-label="gAmErS cOuRtSiDe home"><span className="cs-brand-mark" aria-hidden="true"><span /></span><span className="cs-brand-name">gAmErS<span className="cs-brand-word"> cOuRtSiDe</span></span><span className="cs-brand-dot">.</span></button>
        <div className="cs-header-actions">
          <button type="button" className="cs-icon-button" aria-label="Sign out" title="Sign out" disabled={locked || offline} onClick={() => {
            if (!window.confirm("Sign out? Any unsaved game draft will be lost.")) return;
            void mutate("signout", async () => {
              const { error: signOutError } = await createClient().auth.signOut({ scope: "local" });
              if (signOutError) throw signOutError;
              // A full navigation discards authenticated client state after sign-out.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/login");
            }, "Signed out.");
          }}><ExitIcon width={19} height={19} aria-hidden="true" /></button>
        </div>
      </header>

      <main id="main" className="cs-main">
        {offline ? <div className="cs-banner cs-banner-warning" role="status"><PauseIcon width={18} height={18} aria-hidden="true" /><span>Syncing paused. You are offline. Keep this page open to retain your draft.</span></div> : null}
        {error ? <div className="cs-banner cs-banner-error" role="alert"><span>{error}</span><button className="cs-icon-button" aria-label="Dismiss error" onClick={() => setError("")}><Cross2Icon width={17} height={17} aria-hidden="true" /></button></div> : null}
        <p className="cs-global-status" role="status" aria-live="polite">{notice}</p>
        {/expired|sign.?in|jwt|auth/i.test(`${error} ${selectedError} ${gamesError}`) ? <Link className="cs-text-button" href="/login">Sign in again<ArrowRightIcon width={16} height={16} aria-hidden="true" /></Link> : null}

        <div className="cs-page-heading">
          <div><p className="cs-eyebrow">YOUR BADMINTON CREW</p><h1>{workspaceError ? "Court unavailable" : "gAmErS"}</h1></div>
        </div>

        <nav className="cs-tabs" aria-label="Court sections">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={tab === id ? "is-active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => startTransition(() => setTab(id))}><Icon width={19} height={19} aria-hidden="true" /><span>{label}</span></button>)}</nav>

        {workspaceError ? <section className="cs-empty cs-access-error" role="alert"><h2>We couldn&apos;t open the court.</h2><p>{workspaceError}</p><p>Your sign-in may have expired. Scores are hidden until access is checked.</p><div className="cs-actions"><button className="cs-button cs-button-green" disabled={offline} onClick={() => refresh.current()}><ReloadIcon width={17} height={17} aria-hidden="true" />Try again</button><Link className="cs-button cs-button-outline" href="/login">Sign in again</Link></div></section> : !workspace ? <div className="cs-play-grid" role="status"><div><div className="cs-loading-court" aria-hidden="true"><div /><div /><div /><div /></div><p className="cs-help mt-4!">Getting the court ready...</p></div><div className="cs-score-sheet cs-loading-sheet" aria-hidden="true">{[0, 1, 2].map((row) => <div key={row}><span /><span /></div>)}</div></div> : <CourtProvider value={{
          userId, workspace, names, locked, offline, busy, mutate, setError, setTab, setProfileId, setEditingGame, setSessions, setWorkspace,
          refresh: () => refresh.current(), frozen, error,
        }}>
          {selectedError ? <div className="cs-banner cs-banner-warning" role="alert"><span>Scores may not be up to date. {selectedError}</span><button className="cs-text-button" disabled={offline} onClick={() => refresh.current()}>Retry</button></div> : null}

          <PlayTab hidden={tab !== "play"} playSessionId={playSessionId} setPlaySessionId={setPlaySessionId} playData={playData} playEnded={playEnded} activeSessions={activeSessions} sessionErrors={sessionErrors} attendees={attendees} setAttendees={setAttendees} gameLimit={gameLimit} setGameLimit={setGameLimit} setChoosing={setChoosing} openSession={openSession} chooseSession={chooseSession} save={save} setGamePending={setGamePending} whoPlayed={whoPlayed} isPlanned={isPlanned} />

          <HistoryTab hidden={tab !== "history"} history={history} filteredHistory={filteredHistory} range={range} setRange={setRange} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} rangeFrom={rangeFrom} rangeTo={rangeTo} rangeIncomplete={rangeIncomplete} historySessionId={historySessionId} setHistorySessionId={setHistorySessionId} selectedData={selectedData} selectedError={selectedError} gameLimit={gameLimit} setGameLimit={setGameLimit} loadMore={loadMore} openSession={openSession} playData={playData} playEnded={playEnded} playSessionId={playSessionId} setPlaySessionId={setPlaySessionId} setChoosing={setChoosing} setOlderSessions={setOlderSessions} seasonList={seasonList} whoPlayed={whoPlayed} isPlanned={isPlanned} />

          <StatsTab hidden={tab !== "stats"} season={season} seasonList={seasonList} seasonPick={seasonPick} setSeasonPick={setSeasonPick} seasonGames={seasonGames} gamesError={gamesError} />

          <PeopleTab hidden={tab !== "people"} defaultName={defaultName} setAttendees={setAttendees} />
        </CourtProvider>}
        <FaqTab hidden={tab !== "faq"} />
        <footer className="cs-footer"><span>gAmErS cOuRtSiDe.</span><span>For the love of the game.</span></footer>
      </main>

      <Dialog open={Boolean(profileId)} onOpenChange={(open) => { if (!open) setProfileId(null); }}><DialogContent className="cs-dialog cs-player-dialog"><DialogHeader><p className="cs-eyebrow">PLAYER CARD · {season ? `SEASON ${season.number}` : "ALL TIME"}</p><DialogTitle>{profileId ? names.get(profileId) ?? "Archived player" : ""}</DialogTitle><DialogDescription>Every logged game, all sessions.</DialogDescription></DialogHeader>{profileId ? <PlayerDashboard key={profileId} playerId={profileId} games={seasonGames} names={names} error={gamesError} onPick={setProfileId} onOpenSession={(id) => { setProfileId(null); setRange("all"); setHistorySessionId(id); setGameLimit(50); setTab("history"); }} /> : null}</DialogContent></Dialog>

      <Dialog open={Boolean(editingGame)} onOpenChange={(open) => { if (!open && !gamePending) setEditingGame(null); }}><DialogContent className="cs-dialog cs-edit-dialog" showCloseButton={!gamePending} onInteractOutside={(event) => { if (gamePending) event.preventDefault(); }} onEscapeKeyDown={(event) => { if (gamePending) event.preventDefault(); }}><DialogHeader><DialogTitle>Correct a game</DialogTitle><DialogDescription>Update the teams or final score. Everyone&apos;s stats will be recalculated.</DialogDescription></DialogHeader>{editingGame && sessions[editingGame.session_id] && workspace ? <GameForm key={editingGame.id} game={editingGame} session={sessions[editingGame.session_id].session} players={workspace.players.filter((player) => sessions[editingGame.session_id].playerIds.includes(player.id) || [editingGame.side_a_player_1, editingGame.side_a_player_2, editingGame.side_b_player_1, editingGame.side_b_player_2].includes(player.id))} offline={offline} disabled={Boolean(busy)} onSave={save} onPendingChange={setGamePending} /> : null}</DialogContent></Dialog>
    </div>
  );
}
