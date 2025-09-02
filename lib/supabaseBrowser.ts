// /lib/supabaseBrowser.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/** Cliente para el navegador (usa ANON). No se crea en top-level. */
export function getSupabaseBrowser(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    // Mensaje útil si llega a faltar en runtime (no rompe el build)
    console.warn("⚠️ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    throw new Error("Supabase browser envs are missing");
  }

  _client = createClient(url, anon);
  return _client;
}
