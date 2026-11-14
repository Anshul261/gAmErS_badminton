import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createTestAccount } from "./helpers";

test("existing accounts can sign in on desktop and mobile while registration is closed", async ({ page }) => {
  const account = await createTestAccount();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Back for another game?" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toHaveCount(0);
  await expect(page.getByText("Sign in with your existing account. New account registration is closed.")).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3001/");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "gAmErS", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("direct public signup is blocked by Supabase", async () => {
  const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const result = await client.auth.signUp({ email: `blocked-${crypto.randomUUID()}@example.com`, password: "test-password-123" });
  expect(result.error?.code).toBe("signup_disabled");
  expect(result.data.session).toBeNull();
  expect(result.data.user).toBeNull();
});

test("password recovery still has a route back to sign in", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
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
