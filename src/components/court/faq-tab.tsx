"use client";

import { PROVISIONAL_GAMES } from "@/lib/player-stats";

const faqs: [string, string][] = [
  ["What is this?", "A shared scorebook for our badminton crew. Everyone who signs in sees the same players, sessions and stats, and anyone can log a game."],
  ["How do I get in?", "Sign in with your existing account. New account registration is closed. Adding a player to the score sheet does not create an account."],
  ["Players vs accounts", "Players are the names on the score sheet. Accounts are just for signing in. Add your friends' names under People; they don't need an account to be on the sheet."],
  ["Starting a session", "Go to Play, tap everyone who's playing, pick 11 or 21 points, and press Start. A session is one meetup on one court. If two courts are running, start a session for each and every phone picks the court it is logging for."],
  ["Logging a game", "Pick the players on each side (one or two per side, so 1v1, 1v2 and 2v2 all work), type the final score, and save. Games are won by two points, with no cap."],
  ["Someone turned up late", "Tap \"Add to session\" at the end of the player names on Play. Search for them, or type a new name to add someone who has never played with us before."],
  ["Planning a session ahead", "On Play, leave the players empty, set the date and time, add the place and paste a Google Maps or Waze link, then press Plan session. It shows under On court or planned; when people arrive they open it and tap their names."],
  ["Joining a session that's already going", "Don't start a new one. On Play, open the session under On court now. Everyone logging for the same court should be in the same session; you only start a new one for a second court."],
  ["Who logged this game?", "Every game shows \"by <name>\" next to its number, and your own show \"by you\". Set your name under People; it defaults to the first part of your email. If someone corrects a game, their name replaces the original."],
  ["I got a score wrong", "Every game on the score sheet has Edit score and Delete. Corrections update everyone's stats straight away."],
  ["I finished a session but forgot a game", "Open the session in History and press Reopen session. It goes back on court, you log the game, then press Finish session again."],
  ["Changing a session's date or target", "In History, open the session and use Edit session details."],
  ["Deleting a whole session", "In History, open the session and press Delete this session. Its games disappear from Stats too. This can't be undone."],
  ["How the leaderboard works", `Players are ranked by Season score, a confidence-adjusted win rate using the Wilson lower bound. Every format counts equally, with no partner or opponent weights. A better win rate raises your score; more games at the same win rate raise it too. Short records get a larger uncertainty adjustment. This measures performance in the selected period. Under ${PROVISIONAL_GAMES} games you're Provisional and wait below the ranked table. Full scores decide places; Win % and games played break exact ties. Game order never changes the table.`],
  ["Seasons", "A season lasts 61 days (62 if it starts in June, July or August). Season 1 began with our first session on 19 Sept. Everyone starts level each season, so newcomers can reach the top. Pick a season on Stats to see its table, Hall of fame and player cards; All time covers every game. A finished season stays viewable but is final: its games can no longer be edited."],
  ["Player cards", "Tap any name in Stats or People to see their card: their title, wins, losses, recent form, a momentum line you can scrub through game by game, a trophy cabinet (deuce record, big wins, close losses, best day), best teammates, favourite customers and nemesis. Tap a name inside the card to jump to that player. Find a match searches their games: type a name (\"vs Sam\", \"with Riya\"), a score like 11-9, or a day like Sat, and tap a result to open that score sheet. The Hall of fame on Stats hands out crew-wide awards."],
  ["How do different formats count?", "Singles, doubles and 1v2 all count equally. Every player on the winning side gets one win; every player on the losing side gets one loss. There are no bonuses or penalties for team size, partners, opponents or score margins."],
  ["Does playing more remove luck?", "More games give a better-supported record. Random draws balance luck on average, but one season can still include easier matchups or a run of good form. Season score measures the results you achieved, not a precise estimate of your individual ability. Each new season starts a fresh record."],
  ["Someone stopped playing", "Archive them under People. They're hidden from new sessions but their name and results stay in past games."],
  ["Which time zone?", "Session dates are Dubai time."],
  ["Does it update live?", "Yes, roughly every four seconds while a session is open. If you go offline, syncing pauses and your unsaved game draft is kept until you're back."],
  ["Sharing the app", "Only existing accounts can sign in. You can share the link from People with someone who already has an account. The link does not grant access or let someone register."],
];

export function FaqTab({ hidden }: { hidden: boolean }) {
  return (
    <section hidden={hidden} aria-label="FAQ">
      <div className="cs-session-heading"><div><p className="cs-eyebrow">HOW THIS WORKS</p><h2>Questions, answered.</h2></div></div>
      <div className="cs-faq">{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
    </section>
  );
}
