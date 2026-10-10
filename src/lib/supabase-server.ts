import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only client using the service key. Importing this from a client
// component fails the build (server-only).
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
