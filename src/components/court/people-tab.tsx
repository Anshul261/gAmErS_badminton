"use client";

import { useState } from "react";
import { ArchiveIcon, CheckIcon, CopyIcon, PersonIcon, PlusIcon } from "@radix-ui/react-icons";
import { useConfirm } from "@/components/court/confirm";
import { useCourt } from "@/components/court/context";
import { addPlayer, archivePlayer, updateProfile } from "@/lib/data";

export function PeopleTab({ hidden, defaultName, setAttendees }: { hidden: boolean; defaultName: string; setAttendees: React.Dispatch<React.SetStateAction<string[]>> }) {
  const { userId, workspace, locked, offline, busy, mutate, setError, setProfileId, setWorkspace } = useCourt();
  const confirm = useConfirm();
  const [playerName, setPlayerName] = useState("");
  const [myName, setMyName] = useState("");
  const [copied, setCopied] = useState(false);
  const roster = workspace.players.filter((player) => !player.archived);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
    } catch { setError("Copy was blocked. Share the address from your browser instead."); }
  }

  return (
    <section hidden={hidden} aria-label="People"><div className="cs-session-heading"><div><p className="cs-eyebrow">THE REGULARS. THE OCCASIONALS. EVERYONE.</p><h2>Same court. Good company.</h2></div></div><div className="cs-people-grid"><div><div className="cs-section-heading"><h3>Player roster</h3><span className="cs-count">{roster.length}</span></div><p className="cs-help">Players are names on the score sheet, not accounts. Anyone signed in can log their games.</p><form className="cs-add-player" onSubmit={(event) => {
      event.preventDefault();
      const name = playerName.trim();
      if (!name) return;
      void mutate("player", async () => {
        const player = await addPlayer(name);
        setWorkspace((current) => current ? { ...current, players: [...current.players, player] } : current);
        setPlayerName("");
      }, `${name} is on the roster.`);
    }}><label htmlFor="player-name">Add a player</label><div className="cs-inline-form"><input className="cs-input" id="player-name" placeholder="Their name or court nickname" maxLength={32} required autoComplete="off" value={playerName} disabled={locked} onChange={(event) => setPlayerName(event.target.value)} /><button className="cs-button cs-button-primary" disabled={locked || offline || !playerName.trim()} type="submit"><PlusIcon width={18} height={18} aria-hidden="true" /><span>Add</span></button></div></form><ul className="cs-roster">{roster.map((player, index) => <li key={player.id}><span className="cs-player-number">{String(index + 1).padStart(2, "0")}</span><button type="button" className="cs-player-name cs-player-link" onClick={() => setProfileId(player.id)}>{player.display_name}</button><button type="button" className="cs-icon-button" aria-label={`Archive ${player.display_name}`} title="Archive player" disabled={locked || offline} onClick={async () => {
      if (!(await confirm({ title: `Archive ${player.display_name}?`, body: "They will be hidden from new sessions. Their old scores and name stay in history.", action: "Archive", danger: true }))) return;
      void mutate("archive", async () => {
        await archivePlayer(player.id);
        setWorkspace((current) => current ? { ...current, players: current.players.map((item) => item.id === player.id ? { ...item, archived: true } : item) } : current);
        setAttendees((current) => current.filter((id) => id !== player.id));
      }, `${player.display_name} archived. Past games are unchanged.`);
    }}><ArchiveIcon width={17} height={17} aria-hidden="true" /></button></li>)}</ul>{!roster.length ? <p className="cs-empty cs-empty-small">No names yet. Add at least two players to start a session.</p> : null}{workspace.players.some((player) => player.archived) ? <details className="cs-archived"><summary>Archived players ({workspace.players.filter((player) => player.archived).length})</summary><ul>{workspace.players.filter((player) => player.archived).map((player) => <li key={player.id}><button type="button" className="cs-player-link" onClick={() => setProfileId(player.id)}>{player.display_name}</button></li>)}</ul><p className="cs-help">Their names and results remain in past games.</p></details> : null}</div><aside className="cs-invite-panel"><div className="cs-you-card"><p className="cs-eyebrow">YOUR NAME ON THE SHEET</p><form className="cs-inline-form" aria-label="Your name" onSubmit={(event) => {
      event.preventDefault();
      const name = myName.trim();
      if (!name) return;
      void mutate("profile", async () => {
        const saved = await updateProfile(name);
        setWorkspace((current) => current ? { ...current, profiles: { ...current.profiles, [userId]: saved } } : current);
        setMyName("");
      }, "Name saved. Games you log will show it.");
    }}><label className="cs-sr-only" htmlFor="my-name">Your name</label><input className="cs-input" id="my-name" maxLength={32} autoComplete="nickname" placeholder={workspace.profiles[userId] ?? defaultName} value={myName} disabled={locked} onChange={(event) => setMyName(event.target.value)} /><button className="cs-button cs-button-outline" type="submit" disabled={locked || offline || !myName.trim()}>{busy === "profile" ? "Saving..." : "Save"}</button></form><p className="cs-help">Shown as &quot;by {workspace.profiles[userId] ?? defaultName}&quot; on games you log or correct. {Object.keys(workspace.profiles).length} {Object.keys(workspace.profiles).length === 1 ? "account is" : "accounts are"} signed up: {Object.values(workspace.profiles).sort((a, b) => a.localeCompare(b)).join(", ")}.</p></div><div className="cs-invite-symbol" aria-hidden="true"><PersonIcon width={27} height={27} /><PlusIcon width={16} height={16} /></div><p className="cs-eyebrow">FOR THE EXISTING CREW</p><h3>Your shared scorebook.</h3><p>Share this address with friends who already have an account. New account registration is closed.</p><button className="cs-button cs-button-primary cs-full" onClick={() => void copyLink()}>{copied ? <CheckIcon width={17} height={17} aria-hidden="true" /> : <CopyIcon width={17} height={17} aria-hidden="true" />}{copied ? "Link copied" : "Copy the link"}</button><p role="status" className="cs-sr-only">{copied ? "Link copied to clipboard." : ""}</p><p className="cs-help">Only existing accounts can sign in.</p></aside></div></section>
  );
}
