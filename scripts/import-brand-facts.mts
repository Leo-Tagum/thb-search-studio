// Imports brand facts from the Brand Consistency Project artifact (read-only: the artifact is never edited).
// Statuses are exactly as Leo reported them on 2026-10-10 and checked against the artifact text.
// approved = use; sourced = exact wording only; pending_juan = blocked. Nothing here claims Juan approved anything.
import { createClient } from "@supabase/supabase-js";

const ART = "Brand Consistency Project artifact https://claude.ai/artifact/1ShVzqv7NrDVVyv2TxXsqh, version 1791655944-cad8 (read-only)";
const BY = "leo (importing the artifact's Approved/Sourced status)";
type Row = { fact_key: string; fact_value: string; source_ref: string; status: "approved" | "sourced" | "pending_juan"; usage_rule?: string };

const rows: Row[] = [
  // APPROVED: use
  { fact_key: "company_name", fact_value: "Twin Home Buyer", source_ref: `${ART}: Official information`, status: "approved" },
  { fact_key: "homes_purchased", fact_value: "1,000+", source_ref: `${ART}: Trust and experience > Homes purchased`, status: "approved", usage_rule: "Use as '1,000+' homes purchased. Not an experience or years figure." },
  { fact_key: "phone_display", fact_value: "(415) 415-8946", source_ref: `${ART}: Official information`, status: "approved" },
  { fact_key: "phone_vanity", fact_value: "(415) 415-TWIN", source_ref: `${ART}: Official information`, status: "approved" },
  { fact_key: "website", fact_value: "https://www.twinhomebuyer.com", source_ref: `${ART}: Official information > Website`, status: "approved" },
  { fact_key: "address", fact_value: "170 Glenn Way Ste 5, San Carlos, CA 94070", source_ref: `${ART}: Official information > Address`, status: "approved", usage_rule: "Address only. Whether it may be shown as the service area is PENDING JUAN (see address_vs_service_area)." },
  // SOURCED: use exact wording only
  { fact_key: "legal_entity", fact_value: "Twin Home Buyer Limited Liability Company", source_ref: `${ART}: Legal entity (California Secretary of State record)`, status: "sourced", usage_rule: "Exact wording only." },
  { fact_key: "formation_date", fact_value: "Formed February 25, 2022", source_ref: `${ART}: Legal entity (California Secretary of State record)`, status: "sourced", usage_rule: "Exact wording only. This is the LLC formation date, never a statement of experience." },
  // Revised 2026-10-10 by Leo: see scripts/update-brand-facts-experience.mts (experience_total + since-2002 are two separate approved facts; run that script after this one).
  { fact_key: "industry_experience", fact_value: "Juan Diaz has been investing in Bay Area real estate since 2002", source_ref: `${ART}: Trust and experience > Industry experience`, status: "sourced", usage_rule: "Exact wording only (or the combined sentence with experience_total). Separate fact from experience_total. Never as the company's founding year. The Lawrence SOP '27 years' does not count (voice guide only)." },
  { fact_key: "bbb_accreditation", fact_value: "BBB Accredited since 3/1/2022", source_ref: `${ART}: Trust and experience > BBB`, status: "sourced", usage_rule: "Exact wording only." },
  // STILL PENDING JUAN: blocked
  { fact_key: "hours_24h", fact_value: "PENDING JUAN: business hours / any '24 hours' or '24/7' claim", source_ref: "Leo, 2026-10-10 (listed as still pending)", status: "pending_juan" },
  { fact_key: "closing_time", fact_value: "PENDING JUAN: how fast Twin Home Buyer closes (any closing timeframe)", source_ref: "Leo, 2026-10-10 (listed as still pending)", status: "pending_juan" },
  { fact_key: "ownership", fact_value: "PENDING JUAN: ownership of the company", source_ref: "Leo, 2026-10-10 (listed as still pending)", status: "pending_juan" },
  { fact_key: "contractor_license", fact_value: "PENDING JUAN: contractor license (whether one exists, number, how it may be stated)", source_ref: "Leo, 2026-10-10 (listed as still pending)", status: "pending_juan" },
  { fact_key: "address_vs_service_area", fact_value: "PENDING JUAN: how the San Carlos address relates to the service area", source_ref: "Leo, 2026-10-10 (listed as still pending)", status: "pending_juan" },
  { fact_key: "equity_track_mentions", fact_value: "PENDING JUAN: whether content may mention Equity Track Inc", source_ref: "Leo, 2026-10-10 (listed as still pending); relates to the open conflict on related_entity", status: "pending_juan" },
  { fact_key: "saved_fees_32m", fact_value: "PENDING JUAN: '$32M+ saved fees' claim", source_ref: "Leo, 2026-10-10 (listed as still pending). The literal text was not found in artifact version 1791655944-cad8.", status: "pending_juan" },
  { fact_key: "on_time_100", fact_value: "PENDING JUAN: '100% on time' claim", source_ref: "Leo, 2026-10-10 (listed as still pending). The literal text was not found in artifact version 1791655944-cad8.", status: "pending_juan" },
  { fact_key: "reviews_4_8_115", fact_value: "PENDING JUAN: '4.8/5 (115 reviews)' claim", source_ref: "Leo, 2026-10-10 (listed as still pending). The literal text was not found in artifact version 1791655944-cad8.", status: "pending_juan" },
];

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
// Superseded 'needed' placeholders are replaced by the specific rows above.
const superseded = ["phone_numbers", "transaction_and_experience_claims"];
const { data: gone } = await db.from("brand_facts").select("fact_key,fact_value,status").in("fact_key", superseded);
await db.from("brand_facts").delete().in("fact_key", superseded);
for (const r of rows) {
  const { data: ex } = await db.from("brand_facts").select("id,fact_value,status").eq("fact_key", r.fact_key).maybeSingle();
  const body = { ...r, approved_by: r.status === "pending_juan" ? null : BY, approved_at: r.status === "pending_juan" ? null : new Date().toISOString() };
  const res = ex ? await db.from("brand_facts").update(body).eq("id", ex.id) : await db.from("brand_facts").insert(body);
  if (res.error) throw res.error;
  await db.from("audit_events").insert({ actor: "leo", subject_type: "brand_fact", subject_id: r.fact_key, event_type: "brand_fact_imported", accepted: true, prior_state: ex?.status ?? null, new_state: r.status, detail: { value: r.fact_value, previous_value: ex?.fact_value ?? null, source: ART, applied_by: "claude (on Leo's instruction)" } });
}
await db.from("audit_events").insert({ actor: "leo", subject_type: "brand_fact", subject_id: "conflict:experience", event_type: "brand_fact_conflict_resolved", accepted: true, detail: { superseded: ["27 years (Lawrence SOP)", "25+ years (site pages)"], resolved_to: "Juan Diaz has been investing in Bay Area real estate since 2002", removed_placeholders: gone } });
const c = await db.from("brand_fact_conflicts").insert({ fact_key: "industry_experience", variants: [{ wording: "27 years", source: "Lawrence SOP" }, { wording: "25+ years", source: "site pages" }], resolved_value: "Juan Diaz has been investing in Bay Area real estate since 2002", resolved_by: "leo (per Brand Consistency Project artifact version 1791655944-cad8)" });
if (c.error) throw c.error;
const { data: all } = await db.from("brand_facts").select("status");
const n: Record<string, number> = {}; for (const r of all ?? []) n[r.status] = (n[r.status] ?? 0) + 1;
console.log("brand_facts by status:", JSON.stringify(n), "| imported", rows.length, "| replaced placeholders:", (gone ?? []).map((g) => g.fact_key).join(","));
