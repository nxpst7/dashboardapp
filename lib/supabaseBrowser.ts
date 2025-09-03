// /lib/supabaseBrowser.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseBrowser() {
  if (_client) return _client;
  // Solo en browser
  if (typeof window === "undefined") {
    // Evitamos instanciar durante prerender/SSR
    return null as any;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    console.warn("⚠️ Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return null as any; // evita crear cliente inválido
  }
  _client = createClient(url, anon);
  return _client;
}
