// Brand Fact update (Leo, 2026-10-10; Juan to confirm in writing): two separate approved experience facts.
// Idempotent. Writes audit events. The Lawrence SOP is a voice guide only; none of its facts count.
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BY_PENDING = "leo: approved by Leo, pending Juan's written confirmation";
const SRC = "Leo, 2026-10-10 (instruction in session). Juan to confirm in writing.";
const COMBINED = "Juan Diaz has 25+ years of experience in Bay Area real estate and has been investing since 2002.";

const rows: Record<string, string>[] = [
  {
    fact_key: "experience_total", fact_value: "25+ years of experience in Bay Area real estate", status: "approved", source_ref: SRC, approved_by: BY_PENDING,
    usage_rule: `Total experience, including pre-2002 exploring. Allowed ONLY in this experience sense ("25+ years of experience in Bay Area real estate"). Never an exact count (27 years, 24 years), never "over 25 years", "20+ years" or "25+ years in business". Combined sentence allowed: "${COMBINED}" Approved by Leo, pending Juan's written confirmation.`,
  },
  {
    fact_key: "industry_experience", fact_value: "Juan Diaz has been investing in Bay Area real estate since 2002", status: "sourced",
    usage_rule: `Exact wording only (or the combined sentence "${COMBINED}"). Separate fact from experience_total. Never as the company's founding year (the LLC was formed February 25, 2022). The Lawrence SOP "27 years" does not count: the SOP is a voice guide only.`,
  },
];
for (const r of rows) {
  const { data: ex } = await db.from("brand_facts").select("id,fact_value,status,usage_rule").eq("fact_key", r.fact_key).maybeSingle();
  const body = { ...r, approved_at: new Date().toISOString() };
  const res = ex ? await db.from("brand_facts").update(body).eq("id", ex.id) : await db.from("brand_facts").insert(body);
  if (res.error) throw res.error;
  await db.from("audit_events").insert({ actor: "leo", subject_type: "brand_fact", subject_id: r.fact_key, event_type: "brand_fact_updated", accepted: true, prior_state: ex?.status ?? null, new_state: r.status, detail: { value: r.fact_value, previous_value: ex?.fact_value ?? null, pending: "Juan's written confirmation (experience_total)", applied_by: "claude (on Leo's instruction)" } });
}
await db.from("brand_fact_conflicts").update({ resolved_value: `Two separate facts: "25+ years of experience in Bay Area real estate" (approved by Leo, pending Juan's written confirmation) and "Juan Diaz has been investing in Bay Area real estate since 2002". Exact counts such as 27 years stay blocked.`, resolved_by: "leo (2026-10-10, revised)" }).eq("fact_key", "industry_experience");
await db.from("audit_events").insert({ actor: "leo", subject_type: "brand_fact", subject_id: "conflict:experience", event_type: "brand_fact_conflict_resolved", accepted: true, detail: { revises: "2002-only wording", now: "25+ years (experience sense) and since 2002 are two separate approved facts", lawrence_sop: "voice guide only; none of its facts count" } });
const { data: all } = await db.from("brand_facts").select("fact_key,status,approved_by").in("fact_key", ["experience_total", "industry_experience"]);
console.log(all);
