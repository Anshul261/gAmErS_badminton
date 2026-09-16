export function scoreError(a: number, b: number, target: number): string | null {
  if (![11, 21].includes(target)) return "Choose a game to 11 or 21.";
  if (![a, b].every((n) => Number.isInteger(n) && n >= 0 && n <= 32767)) {
    return "Enter a whole score of zero or more for each side.";
  }
  if (a === b) return "No draws. One side needs to win.";
  const winner = Math.max(a, b);
  const loser = Math.min(a, b);
  if (winner < target) return `The winning side needs at least ${target}.`;
  if (winner === target && loser <= target - 2) return null;
  if (winner > target && winner - loser === 2) return null;
  return "Win by two. Check the final score.";
}

export function dubaiDate(date: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "short",
    ...options,
  }).format(new Date(date.length === 10 ? `${date}T12:00:00+04:00` : date));
}
