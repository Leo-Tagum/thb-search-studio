import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

// Phase 0 health check. supabase-js cannot run raw SQL, so this makes an
// authenticated service-key call that reaches the project's Postgres-backed
// auth schema. Phase 1 can replace it with a true `select 1` RPC.
export async function GET() {
  try {
    const { error } = await supabaseAdmin().auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
