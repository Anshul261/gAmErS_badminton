import { test, expect } from "@playwright/test";

test("sign up with email and password on desktop and mobile", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Back for another game?" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(`browser-${crypto.randomUUID()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3001/");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("failed sign-in stays on the login page with an error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`unknown-${crypto.randomUUID()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Invalid login credentials" })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("auth callback does not accept external redirects", async ({ request }) => {
  const response = await request.get("/auth/callback?next=https://example.com", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("http://localhost:3001/login?error=confirmation");
  expect(response.headers()["cache-control"]).toContain("no-store");
});
