import { supabaseAdmin } from "@/lib/supabase-server";
import { actionsToCsv, type ActionRow } from "@/lib/audit/actions";

export async function GET() {
  const { data } = await supabaseAdmin().from("blog_audit_actions").select("action,old_url,target_url,reason,evidence_summary,status").neq("status", "CANCELLED").order("action");
  return new Response(actionsToCsv((data ?? []) as ActionRow[]), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="blog-audit-actions.csv"' } });
}
