// Builds candidate packets from the latest GSC import. Usage: npm run candidates -- [--save N]
// Without --save it only prints. With --save N it stores the top candidates (quota per kind) as opportunities in CANDIDATE.
import { createClient } from "@supabase/supabase-js";
import { buildCandidates, type FirstPartyProof, type MetricRow, type PageInfo, type Candidate } from "../src/lib/engine/candidates";
import { candidatePacketSchema } from "../src/lib/engine/packet";
import { versionHash } from "../src/lib/orchestrator";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const saveIdx = process.argv.indexOf("--save");
const saveN = saveIdx >= 0 ? Number(process.argv[saveIdx + 1]) : 0;
const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;

const { data: imp } = await db.from("gsc_imports").select("*").order("fetched_at", { ascending: false }).limit(1).single();
if (!imp) throw new Error("no GSC import; run npm run import:gsc first");
const rows: MetricRow[] = [];
for (let from = 0; ; from += 1000) {
  const { data } = await db.from("search_metrics").select("page_url,page_id,query,impressions,clicks,position").eq("import_id", imp.id).range(from, from + 999);
  if (!data?.length) break;
  rows.push(...(data as MetricRow[]));
  if (data.length < 1000) break;
}
const { data: pages } = await db.from("pages").select("id,url,canonical_url,title,meta_title,slug,protection_status,template_flag");
const { count: publishable } = await db.from("seller_brief_passages").select("id", { count: "exact", head: true }).eq("visibility", "publishable");
const { count: cleared } = await db.from("seller_permissions").select("id", { count: "exact", head: true }).eq("publication_cleared", true);
const proof: FirstPartyProof = (cleared ?? 0) > 0 ? "available" : (publishable ?? 0) > 0 ? "restricted" : "unavailable";
console.log(`import ${imp.start_date}..${imp.end_date} (${rows.length} rows, truncated=${imp.truncated}); pages ${pages?.length}; first-party proof: ${proof}`);

const { candidates, excluded } = buildCandidates(rows, (pages ?? []) as PageInfo[], { window: { start: imp.start_date, end: imp.end_date }, firstPartyProof: proof });
const kinds: Record<string, number> = {}; for (const c of candidates) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
console.log("candidates:", candidates.length, JSON.stringify(kinds), "excluded:", JSON.stringify(excluded));
for (const c of candidates.filter((x) => !only || x.kind === only).slice(0, 30)) console.log(`${c.kind.padEnd(9)} ${c.proposed_action.padEnd(6)} imp=${String(c.totals.impressions).padStart(5)} pos=${c.totals.position} so=${c.score.parts.search_opportunity.value} | ${c.title} | pages=${c.pages.length}${c.overlap.supported ? " OVERLAP" : ""}`);

if (saveN > 0) {
  const { data: rej } = await db.from("rejected_intents").select("intent_key").is("new_evidence_note", null);
  const rejected = new Set((rej ?? []).map((r) => r.intent_key));
  const quota: Record<string, number> = { city_swap: Math.ceil(saveN * 0.3), overlap: Math.ceil(saveN * 0.3), improve: Math.ceil(saveN * 0.3), gap: Math.ceil(saveN * 0.3) };
  if (only) quota[only] = saveN;
  const picked: Candidate[] = [];
  for (const c of candidates) {
    if (picked.length >= saveN) break;
    if (rejected.has(c.intent_key) || quota[c.kind] <= 0 || (only && c.kind !== only)) continue;
    quota[c.kind]--; picked.push(c);
  }
  for (const c of picked) {
    const packet = candidatePacketSchema.parse(c);
    const { data: ex } = await db.from("opportunities").select("id").eq("intent_key", c.intent_key).maybeSingle();
    if (ex) { console.log("exists, skipped:", c.title); continue; }
    const page = c.pages.find((p) => p.page_id);
    const { data: o, error } = await db.from("opportunities").insert({
      page_id: page?.page_id ?? null, state: "CANDIDATE", title: c.title, target_intent: c.target_intent, scope: c.scope, intent_key: c.intent_key,
      score: c.score, data_gaps: c.data_gaps, protected_warning: c.flags.protected_warning, template_flag: c.flags.template_flag,
      proposed_action: c.proposed_action, packet, version_hash: versionHash(packet), dev_change_request: c.flags.dev_change_request,
    }).select("id").single();
    if (error) throw error;
    await db.from("audit_events").insert({ actor: "system:engine-a", subject_type: "opportunity", subject_id: o.id, event_type: "candidate_created", prior_state: null, new_state: "CANDIDATE", version_hash: versionHash(packet), accepted: true, detail: { kind: c.kind, intent_key: c.intent_key } });
    console.log("saved", o.id, c.kind, c.proposed_action, c.title);
  }
}
