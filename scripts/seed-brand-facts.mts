// Seeds the Brand Facts proposal. Only facts evidenced in local data are 'proposed'; the rest are 'needed' (not usable).
// Nothing here is approved: Juan approves (see docs/phases/brand-facts-proposal.md).
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const INV = "Inventory page titles/meta ingested 2026-10-10 (pages table)";
const rows = [
  { fact_key: "company_name", fact_value: "Twin Home Buyer", source_ref: `${INV}: 23 title/meta occurrences, one spelling`, status: "proposed" },
  { fact_key: "website", fact_value: "https://www.twinhomebuyer.com/", source_ref: "GSC property (Phase 0 handoff) and sitemap canonicals", status: "proposed" },
  { fact_key: "owner_name_and_title", fact_value: "Juan Diaz, CEO", source_ref: `${INV}: page 'About Juan Diaz, CEO, Twin Home Buyer'; Juan to confirm exact title`, status: "proposed" },
  { fact_key: "primary_geography", fact_value: "San Francisco Bay Area", source_ref: `${INV}: home page title 'We Buy Houses for Cash in the Bay Area'`, status: "proposed" },
  { fact_key: "core_service", fact_value: "Buys houses for cash, as-is", source_ref: `${INV}: home page title and 'sell my house as-is' pages; Juan to confirm wording`, status: "proposed" },
  { fact_key: "related_entity", fact_value: "Equity Track Inc (page says 'powered by Twin Home Buyer')", source_ref: `${INV}: page slug equity-track-inc-powered-by-twin-home-buyer; relationship unclear`, status: "conflict" },
  { fact_key: "allowable_timeframes", fact_value: "NEEDED: which closing/offer timeframes may be stated (a '7 days' page exists)", source_ref: "Slug sell-your-house-in-7-days; no approved wording on file", status: "needed" },
  { fact_key: "counties_and_cities_served", fact_value: "NEEDED: approved service-area list (site has ~124 city-style pages; some outside the Bay Area, e.g. Sacramento, Modesto)", source_ref: "Inventory slug patterns", status: "needed" },
  { fact_key: "phone_numbers", fact_value: "NEEDED: main number plus separate SEO and PPC tracking numbers", source_ref: "Blueprint §6 Brand Facts", status: "needed" },
  { fact_key: "author_bio", fact_value: "NEEDED: approved author bio for bylines", source_ref: "Blueprint §6 Brand Facts", status: "needed" },
  { fact_key: "transaction_and_experience_claims", fact_value: "NEEDED: approved counts, years in business, licences; none may be stated until supplied", source_ref: "Blueprint core rule 3", status: "needed" },
  { fact_key: "services_list", fact_value: "NEEDED: approved list of services", source_ref: "Blueprint §6 Brand Facts", status: "needed" },
  { fact_key: "voice_reference", fact_value: "NEEDED: Leo to pick 3-5 existing posts that sound right; excerpts then proposed to Juan", source_ref: "Design §7", status: "needed" },
];
await db.from("brand_facts").delete().neq("fact_key", "");
const { error } = await db.from("brand_facts").insert(rows);
if (error) throw error;
await db.from("brand_fact_conflicts").delete().neq("fact_key", "");
const c = await db.from("brand_fact_conflicts").insert({
  fact_key: "related_entity",
  variants: [{ wording: "Equity Track Inc powered by Twin Home Buyer", source: "page slug" }, { wording: "Twin Home Buyer (no mention of Equity Track Inc)", source: "all other page titles" }],
});
if (c.error) throw c.error;
await db.from("audit_events").insert({ actor: "claude-code", subject_type: "brand_facts", subject_id: "set-1", event_type: "brand_facts_proposed", accepted: true, detail: { proposed: rows.filter((r) => r.status === "proposed").length, needed: rows.filter((r) => r.status === "needed").length, conflict: 1 } });
console.log(JSON.stringify({ rows: rows.length }));
