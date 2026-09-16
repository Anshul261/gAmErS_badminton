import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (!status.PUBLISHABLE_KEY?.startsWith("sb_publishable_") || new URL(status.API_URL).hostname !== "127.0.0.1") {
  throw new Error("E2E tests require local Supabase and a publishable key. They never run against the hosted project.");
}
process.env.TEST_SUPABASE_URL = status.API_URL;
process.env.TEST_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: { baseURL: "http://localhost:3001", trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["iPhone 13"], viewport: { width: 360, height: 800 }, defaultBrowserType: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev:local -- --port 3001",
    url: "http://localhost:3001/login",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
