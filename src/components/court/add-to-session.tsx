"use client";

import { useState } from "react";
import { CheckIcon, PlusIcon } from "@radix-ui/react-icons";
import { useCourt } from "@/components/court/context";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addAttendee, addPlayer } from "@/lib/data";
import type { Session } from "@/lib/types";

type AddToSessionProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session;
  here: string[]; // player IDs already in the session
  initialQuery?: string;
};

/** Add people who arrive late: tap a roster name, or type a new one to create the player and add them in one step. */
export function AddToSession({ open, onOpenChange, session, here, initialQuery = "" }: AddToSessionProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="cs-dialog cs-add-dialog">
        <DialogHeader>
          <DialogTitle>Add to this session</DialogTitle>
          <DialogDescription>Tap everyone who just arrived.</DialogDescription>
        </DialogHeader>
        <AddToSessionBody session={session} here={here} initialQuery={initialQuery} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

// Mounted only while the dialog is open, so the search and the checked list reset each time.
function AddToSessionBody({ session, here, initialQuery, onDone }: { session: Session; here: string[]; initialQuery: string; onDone: () => void }) {
  const { workspace, locked, offline, mutate, setSessions, setWorkspace } = useCourt();
  const [query, setQuery] = useState(initialQuery);
  const [added, setAdded] = useState<string[]>([]);
  const off = locked || offline;
  const typed = query.trim();
  const needle = typed.toLowerCase();
  const exact = needle ? workspace.players.find((player) => player.display_name.toLowerCase() === needle) : undefined;
  const list = workspace.players.filter((player) => !player.archived && (!here.includes(player.id) || added.includes(player.id)) && player.display_name.toLowerCase().includes(needle));

  const join = (playerId: string) => setSessions((current) => current[session.id] && !current[session.id].playerIds.includes(playerId)
    ? { ...current, [session.id]: { ...current[session.id], playerIds: [...current[session.id].playerIds, playerId] } }
    : current);

  return (
    <div className="cs-add-body">
      <div>
        <label className="cs-label" htmlFor="add-to-session-search">Search or type a new name</label>
        <input id="add-to-session-search" className="cs-input" type="search" autoFocus autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={32} enterKeyHint="done" value={query} disabled={off} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
      </div>
      {list.length ? <div className="cs-chips cs-attendee-chips">{list.map((player) => {
        const isIn = added.includes(player.id);
        return <button type="button" key={player.id} className={`cs-chip ${isIn ? "is-selected" : ""}`} aria-pressed={isIn} disabled={off || isIn} onClick={() => void mutate("attendee", async () => {
          await addAttendee(session, player.id);
          setAdded((current) => [...current, player.id]);
          join(player.id);
        }, `${player.display_name} is in.`)}>{isIn ? <CheckIcon width={16} height={16} aria-hidden="true" /> : <PlusIcon width={16} height={16} aria-hidden="true" />}<span>{player.display_name}</span></button>;
      })}</div> : null}
      {typed && !exact ? <button type="button" className="cs-button cs-button-outline cs-add-new" disabled={off} onClick={() => void mutate("attendee", async () => {
        const player = await addPlayer(typed);
        setWorkspace((current) => current ? { ...current, players: [...current.players, player] } : current);
        try {
          await addAttendee(session, player.id);
        } catch (cause) {
          // The player now exists, so say so: tapping their name retries without a duplicate-name error.
          throw new Error(`${player.display_name} is on the roster now but wasn't added to this session. Tap their name to try again. ${cause instanceof Error ? cause.message : ""}`.trim());
        }
        setAdded((current) => [...current, player.id]);
        join(player.id);
        setQuery("");
      }, `${typed} is new and in.`)}><PlusIcon width={17} height={17} aria-hidden="true" />Add &quot;{typed}&quot; as a new player</button> : null}
      {exact?.archived ? <p className="cs-help" role="status">{exact.display_name} is archived. Ask someone to restore them, or use a different name.</p> : null}
      {exact && !exact.archived && here.includes(exact.id) ? <p className="cs-help" role="status">{exact.display_name} is already in this session.</p> : null}
      {!list.length && !typed ? <p className="cs-help">Everyone on the roster is already here. Type a name to add someone new.</p> : null}
      <button type="button" className="cs-button cs-button-outline cs-full" onClick={onDone}>Done</button>
    </div>
  );
}
