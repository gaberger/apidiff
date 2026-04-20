// Singleton Supabase browser client. Reads Vite-exposed env vars. Returns
// null if env is missing — composition-root uses that signal to fall back
// to the localStorage adapters. Never imports server-only keys; only the
// anon/publishable key is safe for the browser bundle.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

function readEnv(name: string): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.[name];
}

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  // Accept VITE_* (local convention) or NEXT_PUBLIC_* (Vercel Supabase
  // integration default). Either prefix gets bundled because vite.config.ts
  // widens envPrefix to both.
  const url = readEnv("VITE_SUPABASE_URL") ?? readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey =
    readEnv("VITE_SUPABASE_ANON_KEY") ??
    readEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ??
    readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ??
    readEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !anonKey) {
    cached = null;
    return null;
  }
  cached = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function hasSupabase(): boolean {
  return getSupabase() !== null;
}
