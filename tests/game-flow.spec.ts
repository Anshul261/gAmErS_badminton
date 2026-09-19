import { test, expect, type Page } from "@playwright/test";

async function signup(page: Page) {
  await page.goto("http://localhost:3001/login");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(`game-${crypto.randomUUID()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "gAmErS", exact: true })).toBeVisible();
}

test("log mixed doubles, sync phones, correct scores and browse history", async ({ page, browser }, info) => {
  await signup(page);
  // Player names are unique across the whole court, so each run gets its own trio.
  const suffix = info.project.name.slice(0, 1).toUpperCase() + crypto.randomUUID().slice(0, 4);
  const [riya, sam, jay] = ["Riya", "Sam", "Jay"].map((name) => `${name} ${suffix}`);
  const trio = `${jay}, ${riya}, ${sam}`;
  const duo = `${jay}, ${sam}`;
  const nav = page.getByRole("navigation", { name: "Court sections" });
  await nav.getByRole("button", { name: "People", exact: true }).click();
  const people = page.getByRole("region", { name: "People", exact: true });
  const scorer = `Scorer ${suffix}`;
  await people.getByRole("textbox", { name: "Your name", exact: true }).fill(scorer);
  await people.getByRole("form", { name: "Your name", exact: true }).getByRole("button", { name: "Save", exact: true }).click();
  await expect(people.getByText(`"by ${scorer}"`, { exact: false })).toBeVisible();
  for (const name of [riya, sam, jay]) {
    await people.getByLabel("Add a player", { exact: true }).fill(name);
    await people.getByRole("button", { name: "Add", exact: true }).click();
    await expect(people.getByRole("button", { name: `Archive ${name}` })).toBeVisible();
  }
  await nav.getByRole("button", { name: "Play", exact: true }).click();
  // A lone open court from an earlier run is auto-opened; step out of it to start our own.
  const setup = page.getByRole("form", { name: "Start a session", exact: true });
  const gameForm = page.getByRole("form", { name: "Log game", exact: true });
  await expect(setup.or(gameForm)).toBeVisible();
  if (await gameForm.isVisible()) {
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Another session", exact: true }).click();
  }
  await expect(setup).toBeVisible();
  for (const name of [riya, sam, jay]) await setup.getByRole("button", { name, exact: true }).click();
  await setup.getByRole("button", { name: "Start session with 3" }).click();
  await expect(gameForm).toBeVisible();

  // A second court runs at the same time and each phone picks which one it logs for.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Another session", exact: true }).click();
  const courts = page.getByRole("region", { name: "Play", exact: true }).getByRole("list", { name: "On court or planned" });
  await expect(courts.getByRole("listitem").filter({ hasText: trio })).toBeVisible();
  for (const name of [sam, jay]) await setup.getByRole("button", { name, exact: true }).click();
  await setup.getByRole("button", { name: "Start session with 2" }).click();
  await expect(gameForm).toBeVisible();
  await expect(page.getByText(/\d+ sessions are on court/)).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Switch", exact: true }).click();
  await courts.getByRole("listitem").filter({ hasText: trio }).getByRole("button", { name: "Open" }).click();
  await expect(gameForm).toBeVisible();
  await expect(page.getByText("3 playing", { exact: true })).toBeVisible();
  // A reload lands this account back on the court it chose, even with two open.
  await page.reload();
  await expect(page.getByRole("form", { name: "Log game", exact: true })).toBeVisible();
  await expect(page.getByText("3 playing", { exact: true })).toBeVisible();

  // Plan a session for next week with a place and a Waze link; nobody is in yet.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Another session", exact: true }).click();
  const venue = `Court ${suffix}`;
  await setup.getByLabel("Date", { exact: true }).fill("2030-01-05");
  await setup.getByLabel("Time (optional)", { exact: true }).fill("19:30");
  await setup.getByLabel("Place (optional)", { exact: true }).fill(venue);
  await setup.getByLabel("Map link (optional)", { exact: true }).fill("https://waze.com/ul/hsomewhere");
  await setup.getByRole("button", { name: "Plan session", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Who's here?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open in Waze" })).toHaveAttribute("href", "https://waze.com/ul/hsomewhere");
  await expect(page.getByText(venue, { exact: true })).toBeVisible();
  await expect(page.getByRole("form", { name: "Log game", exact: true })).toHaveCount(0);
  // People arrive and tap themselves in; the game form appears at two.
  const whosHere = page.getByRole("region", { name: "Play", exact: true });
  await whosHere.getByRole("button", { name: riya, exact: true }).click();
  await expect(page.getByText(`${riya} is in.`, { exact: true })).toBeVisible();
  await whosHere.getByRole("button", { name: sam, exact: true }).click();
  await expect(page.getByRole("form", { name: "Log game", exact: true })).toBeVisible();
  // The picker lists it as planned, with the place.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Another session", exact: true }).click();
  await expect(courts.getByRole("listitem").filter({ hasText: `${riya}, ${sam}` }).filter({ hasText: `Planned Sat, 5 Jan 2030 · 19:30 · ${venue}` })).toBeVisible();
  // Back to the trio's court for the rest of the flow.
  await courts.getByRole("listitem").filter({ hasText: trio }).getByRole("button", { name: "Open" }).click();
  await expect(page.getByText("3 playing", { exact: true })).toBeVisible();

  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  try {
    await signup(other);
    // Two courts are open, so the second phone has to choose rather than being dropped into one.
    await other.getByRole("list", { name: "On court or planned" }).getByRole("listitem").filter({ hasText: trio }).getByRole("button", { name: "Open" }).click();
    await expect(other.getByRole("form", { name: "Log game", exact: true })).toBeVisible();

    await gameForm.getByRole("button", { name: `Add ${riya} to side A` }).click();
    await gameForm.getByRole("button", { name: /Side B Pick players/ }).click();
    await gameForm.getByRole("button", { name: `Add ${sam} to side B` }).click();
    await gameForm.getByRole("button", { name: `Add ${jay} to side B` }).click();
    await gameForm.getByLabel("Side A", { exact: true }).fill("11");
    await gameForm.getByLabel("Side B", { exact: true }).fill("11");
    await gameForm.getByRole("button", { name: "Save game", exact: true }).click();
    await expect(gameForm.getByRole("alert")).toHaveText("No draws. One side needs to win.");
    await gameForm.getByLabel("Side A", { exact: true }).fill("13");
    await gameForm.getByRole("button", { name: "Save game", exact: true }).click();
    await expect(page.getByText("1 game logged", { exact: true })).toBeVisible();
    await expect(gameForm.getByLabel("Side A", { exact: true })).toHaveValue("");
    await expect(page.getByText("by you", { exact: true })).toBeVisible();
    await expect(other.getByText("1 game logged", { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(other.getByText(`by ${scorer}`, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("active-session.png"), fullPage: true });

    await page.getByRole("button", { name: "Edit game 1", exact: true }).click();
    await other.getByRole("button", { name: "Edit game 1", exact: true }).click();
    const correction = page.getByRole("dialog", { name: "Correct a game" });
    await correction.getByLabel("Side A", { exact: true }).fill("11");
    await correction.getByLabel("Side B", { exact: true }).fill("9");
    await correction.getByRole("button", { name: "Save correction" }).click();
    await expect(correction).not.toBeVisible();
    const otherCorrection = other.getByRole("dialog", { name: "Correct a game" });
    await otherCorrection.getByLabel("Side A", { exact: true }).fill("11");
    await otherCorrection.getByLabel("Side B", { exact: true }).fill("8");
    await otherCorrection.getByRole("button", { name: "Save correction" }).click();
    await expect(otherCorrection.getByRole("alert")).toContainText("changed on another phone");
    await otherCorrection.getByRole("button", { name: "Close", exact: true }).click();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Finish session", exact: true }).click();
    await expect(page.getByRole("heading", { name: "That's a session." })).toBeVisible();
    await nav.getByRole("button", { name: "History", exact: true }).click();
    const filter = page.getByRole("group", { name: "Show sessions from" });
    await filter.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByRole("button", { name: `Session finished ${trio} · Games to 11`, exact: false })).toBeVisible();
    await filter.getByRole("button", { name: "Custom", exact: true }).click();
    await page.getByLabel("From", { exact: true }).fill("2020-01-01");
    await page.getByLabel("To", { exact: true }).fill("2020-01-31");
    await expect(page.getByRole("heading", { name: "No sessions in this range." })).toBeVisible();
    await filter.getByRole("button", { name: "7 days", exact: true }).click();
    await page.getByRole("button", { name: `On court ${duo} · Games to 11`, exact: false }).click();
    await expect(page.getByRole("region", { name: "History", exact: true }).getByText("0 games", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Session finished ${trio} · Games to 11`, exact: false }).click();
    await expect(page.getByRole("region", { name: "History", exact: true }).getByRole("button", { name: "Edit game 1", exact: true })).toBeVisible();
    await nav.getByRole("button", { name: "Stats", exact: true }).click();
    const table = page.getByRole("table");
    // Riya beat Sam + Jay solo (a 1v2), then Riya/Sam beat Jay 2v1... Score ranks Riya first with the solo bonus.
    await expect(table.getByRole("row").filter({ hasText: riya })).toContainText("100%");
    await expect(table.getByRole("row").filter({ hasText: sam })).toContainText("0%");
    await expect(table.getByRole("columnheader", { name: /Score/ })).toBeVisible();
    await page.getByRole("button", { name: "What does Score mean?" }).click();
    await expect(page.getByRole("region", { name: "Column meaning" })).toContainText("Higher is better");
    // Riya's solo 1v2 win is worth more than an even game; Sam and Jay each lost one as the pair.
    await expect(table.getByRole("row").filter({ hasText: riya })).toContainText(/\+1\.[0-9]/);
    await expect(table.getByRole("row").filter({ hasText: sam })).toContainText(/-1\.0/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Finish the spare court so it does not linger for the next run.
    await nav.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByRole("button", { name: "Set up next session", exact: true }).click();
    await courts.getByRole("listitem").filter({ hasText: duo }).getByRole("button", { name: "Open" }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Finish session", exact: true }).click();
    await expect(page.getByRole("heading", { name: "That's a session." })).toBeVisible();
    // A forgotten game: reopen the trio's session from History, log it, finish again.
    await nav.getByRole("button", { name: "History", exact: true }).click();
    await page.getByRole("button", { name: `Session finished ${trio} · Games to 11`, exact: false }).click();
    const historyRegion = page.getByRole("region", { name: "History", exact: true });
    await historyRegion.getByText("Edit session details").click();
    const editSession = historyRegion.getByRole("form", { name: "Edit session details", exact: true });
    await editSession.getByRole("combobox", { name: "Games to" }).selectOption("21");
    await editSession.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: `Session finished ${trio} · Games to 21`, exact: false })).toBeVisible();
    await historyRegion.getByRole("button", { name: "Reopen session", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Let the games begin." })).toBeVisible();
    await expect(page.getByText("3 playing", { exact: true })).toBeVisible();
    await gameForm.getByRole("button", { name: `Add ${sam} to side A` }).click();
    await gameForm.getByRole("button", { name: /Side B Pick players/ }).click();
    await gameForm.getByRole("button", { name: `Add ${jay} to side B` }).click();
    await gameForm.getByLabel("Side A", { exact: true }).fill("21");
    await gameForm.getByLabel("Side B", { exact: true }).fill("15");
    await gameForm.getByRole("button", { name: "Save game", exact: true }).click();
    await expect(page.getByText("2 games logged", { exact: true })).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Finish session", exact: true }).click();
    await expect(page.getByRole("heading", { name: "That's a session." })).toBeVisible();
    // The FAQ tab is plain reading.
    await nav.getByRole("button", { name: "FAQ", exact: true }).click();
    await page.getByRole("region", { name: "FAQ", exact: true }).getByText("I finished a session but forgot a game").click();
    await expect(page.getByText(/press Reopen session/)).toBeVisible();
    // Delete the spare session from History; its games leave the stats with it.
    await nav.getByRole("button", { name: "History", exact: true }).click();
    // The planned session never got played; finish it from Play, then it is deleted with the rest.
    await nav.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByRole("button", { name: "Set up next session", exact: true }).click();
    await courts.getByRole("listitem").filter({ hasText: venue }).getByRole("button", { name: "Open" }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Finish session", exact: true }).click();
    await expect(page.getByRole("heading", { name: "That's a session." })).toBeVisible();
    await nav.getByRole("button", { name: "History", exact: true }).click();
    await page.getByRole("button", { name: `Session finished ${riya}, ${sam} · ${venue}`, exact: false }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete this session", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Every session has a story." })).toBeVisible();
    for (const who of [trio, duo]) {
      await page.getByRole("button", { name: `Session finished ${who} · Games to`, exact: false }).click();
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Delete this session", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Every session has a story." })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: trio, exact: false })).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});
