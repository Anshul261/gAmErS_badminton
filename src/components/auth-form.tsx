"use client";

import { useState, type FormEvent } from "react";
import { ArrowRightIcon, LockClosedIcon } from "@radix-ui/react-icons";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ callbackError = false, resetPassword = false }: { callbackError?: boolean; resetPassword?: boolean }) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">(resetPassword ? "reset" : "login");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(callbackError ? "That email link has expired or was opened in a different browser. Request a new link and open it here." : "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") ?? "").trim();
    const password = String(fields.get("password") ?? "");
    setPending(true);
    setError("");
    setMessage("");
    try {
      const supabase = createClient();
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage("Check your email to confirm your account, then open the link in this browser.");
          return;
        }
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        if (error) throw error;
        setMessage("If this email has an account, a reset link is on its way. Open it in this browser.");
        return;
      } else if (mode === "reset") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      // Discard any cached private pages when the signed-in account changes.
      window.location.assign(new URL("/", window.location.origin).href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't connect. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const title = mode === "signup" ? "Meet you on court." : mode === "forgot" ? "Forgot your password?" : mode === "reset" ? "A fresh password." : "Back for another game?";
  return (
    <main className="min-h-dvh bg-background lg:grid lg:grid-cols-[1.1fr_1fr]">
      <section className="relative flex min-h-56 flex-col justify-between overflow-hidden bg-primary px-6 py-6 text-primary-foreground md:px-12 lg:min-h-dvh lg:p-16">
        <div className="relative z-10 flex items-center gap-3 text-xl font-bold tracking-tight"><span className="grid size-9 place-items-center rounded-full border border-white/40 text-sm">g.</span> gAmErS cOuRtSiDe</div>
        <div className="relative z-10 my-7 max-w-md lg:my-24">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-accent">Your people. Your scorebook.</p>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.045em] md:text-5xl lg:text-6xl">Play the game.<br />Keep the receipts.</h1>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/75 lg:text-base">Log the last game before the next one starts. Settle the arguments later.</p>
        </div>
        <p className="relative z-10 hidden text-sm text-white/65 lg:block">Badminton nights, Dubai.</p>
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 bottom-[-100px] h-[380px] w-[280px] rotate-[-24deg] border-2 border-white/10"><div className="absolute inset-x-0 top-1/2 border-t-2 border-white/10" /><div className="absolute inset-y-0 left-1/2 border-l-2 border-white/10" /><div className="absolute inset-5 border border-white/10" /></div>
      </section>
      <section className="flex items-center justify-center px-6 py-8 md:p-12">
        <div className="w-full max-w-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Friends only</p>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{mode === "signup" ? "Create an account and you're on the court with the rest of the crew." : mode === "forgot" ? "Enter your email and we'll send a reset link." : mode === "reset" ? "Use at least 8 characters." : "Sign in to the crew's games, scores, and friendly rivalries."}</p>
          <form onSubmit={submit} className="mt-6 space-y-5">
            <fieldset disabled={pending} className="space-y-5">
              {mode !== "reset" ? <div className="space-y-2"><Label htmlFor="email">Email</Label><Input className="h-12 bg-card text-base md:text-base" id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} /></div> : null}
              {mode !== "forgot" ? <div className="space-y-2"><Label htmlFor="password">{mode === "reset" ? "New password" : "Password"}</Label><Input className="h-12 bg-card text-base md:text-base" id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? undefined : 8} maxLength={128} required /></div> : null}
              {error ? <p role="alert" className="rounded border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
              {message ? <p role="status" className="rounded bg-accent p-3 text-sm text-primary">{message}</p> : null}
              <Button type="submit" className="h-12 w-full gap-2 text-base">{pending ? "One moment..." : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Save password" : "Sign in"}<ArrowRightIcon aria-hidden="true" width={18} height={18} /></Button>
            </fieldset>
          </form>
          {mode === "login" ? <Button variant="link" disabled={pending} className="mt-2 h-11 px-0" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>Forgot password?</Button> : null}
          {mode !== "reset" ? <div className="mt-6 border-t pt-5 text-sm text-muted-foreground">{mode === "login" ? "First game with us?" : "Already have an account?"} <button type="button" disabled={pending} className="min-h-11 font-semibold text-foreground underline underline-offset-4" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); }}>{mode === "login" ? "Create account" : "Sign in"}</button></div> : null}
          <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><LockClosedIcon aria-hidden="true" width={15} height={15} />Only signed-in friends can see the games.</p>
        </div>
      </section>
    </main>
  );
}
