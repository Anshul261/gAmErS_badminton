import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

/** Provision fixtures through the local admin API while public registration stays closed. */
export async function createTestAccount(name = "test") {
  const url = process.env.TEST_SUPABASE_URL;
  const key = process.env.TEST_SUPABASE_ADMIN_KEY;
  if (!url || new URL(url).hostname !== "127.0.0.1" || !key) {
    throw new Error("Test accounts can only be created in local Supabase.");
  }
  const email = `${name}-${crypto.randomUUID()}@example.com`;
  const password = "test-password-123";
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("Test account was not created.");
  return { id: data.user.id, email, password };
}

export async function signInTestAccount(page: Page) {
  const account = await createTestAccount();
  await page.goto("http://localhost:3001/login");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
