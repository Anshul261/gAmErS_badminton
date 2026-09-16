import { execFileSync, spawn } from "node:child_process";

const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
if (!status.PUBLISHABLE_KEY?.startsWith("sb_publishable_")) throw new Error("Start local Supabase with npm run db:start first.");
const child = spawn("npx", ["next", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  },
});
child.on("exit", (code) => process.exit(code ?? 1));
