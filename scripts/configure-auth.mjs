const token = process.env.SUPABASE_ACCESS_TOKEN;
const project = process.env.SUPABASE_PROJECT_REF;
const origin = new URL(process.argv[2] ?? "http://localhost:3000");
if (!token || !project) throw new Error("Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF in your shell. These are deployment credentials, never app environment variables.");
if (origin.protocol !== "https:" && origin.hostname !== "localhost") throw new Error("Use an HTTPS deployment URL.");
const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(project)}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    site_url: origin.origin,
    uri_allow_list: `${origin.origin}/auth/callback,${origin.origin}/auth/callback?next=/reset-password`,
    external_email_enabled: true,
    external_anonymous_users_enabled: false,
    external_phone_enabled: false,
    password_min_length: 8,
    refresh_token_rotation_enabled: true,
    ...(process.argv.includes("--close-signups") ? { disable_signup: true } : {}),
  }),
});
if (!response.ok) throw new Error(`Auth configuration failed with HTTP ${response.status}.`);
console.log(`Auth redirects configured for ${origin.origin}. Email confirmation and SMTP settings were not changed.`);
