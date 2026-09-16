import { test, expect, type Page } from "@playwright/test";

async function signup(page: Page) {
  await page.goto("http://localhost:3001/login");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(`game-${crypto.randomUUID()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByLabel("Group name", { exact: true })).toBeVisible();
}

test("log mixed doubles, sync phones, correct scores and browse history", async ({ page, browser }, info) => {
  await signup(page);
  const groupName = `Thursday ${info.project.name}`;
  await page.getByLabel("Group name", { exact: true }).fill(groupName);
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  const inviteDialog = page.getByRole("dialog", { name: "Your group's invite code" });
  await expect(inviteDialog).toBeVisible();
  const inviteCode = await inviteDialog.locator("code").innerText();
  await inviteDialog.getByRole("button", { name: "I've saved the code" }).click();
  const nav = page.getByRole("navigation", { name: "Group sections" });
  await nav.getByRole("button", { name: "People", exact: true }).click();
  const people = page.getByRole("region", { name: "People", exact: true });
  for (const name of ["Riya", "Sam", "Jay"]) {
    await people.getByLabel("Add a player", { exact: true }).fill(name);
    await people.getByRole("button", { name: "Add", exact: true }).click();
    await expect(people.getByRole("button", { name: `Archive ${name}` })).toBeVisible();
  }
  await nav.getByRole("button", { name: "Play", exact: true }).click();
  for (const name of ["Riya", "Sam", "Jay"]) await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "Start session with 3" }).click();
  const gameForm = page.getByRole("form", { name: "Log game", exact: true });
  await expect(gameForm).toBeVisible();

  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  try {
    await signup(other);
    await other.getByRole("button", { name: "Join friends", exact: true }).click();
    await other.getByLabel("Invite code", { exact: true }).fill(inviteCode);
    await other.getByRole("button", { name: "Join group", exact: true }).click();
    await expect(other.getByRole("heading", { name: groupName, exact: true })).toBeVisible();
    await expect(other.getByRole("form", { name: "Log game", exact: true })).toBeVisible();

    await gameForm.getByRole("button", { name: "Add Riya to side A" }).click();
    await gameForm.getByRole("button", { name: /Side B Pick players/ }).click();
    await gameForm.getByRole("button", { name: "Add Sam to side B" }).click();
    await gameForm.getByRole("button", { name: "Add Jay to side B" }).click();
    await gameForm.getByLabel("Side A", { exact: true }).fill("11");
    await gameForm.getByLabel("Side B", { exact: true }).fill("11");
    await gameForm.getByRole("button", { name: "Save game", exact: true }).click();
    await expect(gameForm.getByRole("alert")).toHaveText("No draws. One side needs to win.");
    await gameForm.getByLabel("Side A", { exact: true }).fill("13");
    await gameForm.getByRole("button", { name: "Save game", exact: true }).click();
    await expect(page.getByText("1 game logged", { exact: true })).toBeVisible();
    await expect(gameForm.getByLabel("Side A", { exact: true })).toHaveValue("");
    await expect(other.getByText("1 game logged", { exact: true })).toBeVisible({ timeout: 20000 });
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
    await page.getByRole("button", { name: /Session finished Games to 11/ }).click();
    await expect(page.getByRole("region", { name: "History", exact: true }).getByRole("button", { name: "Edit game 1", exact: true })).toBeVisible();
    await nav.getByRole("button", { name: "Stats", exact: true }).click();
    const table = page.getByRole("table");
    await expect(table.getByRole("row").filter({ hasText: "Riya" })).toContainText("100%");
    await expect(table.getByRole("row").filter({ hasText: "Sam" })).toContainText("0%");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Create or join", exact: true }).click();
    const groupDialog = page.getByRole("dialog", { name: "Find your court" });
    await groupDialog.getByLabel("Group name", { exact: true }).fill("A second court with a longer group name");
    await groupDialog.getByRole("button", { name: "Create group", exact: true }).click();
    await page.getByRole("dialog", { name: "Your group's invite code" }).getByRole("button", { name: "I've saved the code" }).click();
    await expect(page.getByRole("combobox", { name: "Your group", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await otherContext.close();
  }
});
