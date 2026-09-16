"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6"><p className="text-sm font-semibold uppercase tracking-widest">Courtside</p><h1 className="text-3xl font-semibold">Could not reach the scorebook.</h1><p className="text-muted-foreground">Check your connection and try again. Your saved games are still in the database.</p><button onClick={reset} className="min-h-12 rounded-lg bg-primary px-5 font-medium text-primary-foreground">Try again</button><a href="/login" className="py-3 text-center underline">Back to sign in</a></main>;
}
