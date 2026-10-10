// Fold a duplicate candidate into an approved opportunity that targets the same page. Usage:
//   npm run fold -- <duplicate_id> <into_id> "<reason>"
// Human instruction only (actor "leo"). The duplicate is cancelled, its queries travel with the approved packet.
import { createClient } from "@supabase/supabase-js";
import { Orchestrator } from "../src/lib/orchestrator";
import { SupabaseRepo } from "../src/lib/orchestrator/supabase-repo";

const [dupId, intoId, reason] = process.argv.slice(2);
if (!dupId || !intoId || !reason) throw new Error("usage: fold <duplicate_id> <into_id> <reason>");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: dup } = await db.from("opportunities").select("*").eq("id", dupId).single();
const { data: into } = await db.from("opportunities").select("*").eq("id", intoId).single();
if (!dup || !into) throw new Error("not found");
const urls = (o: typeof dup) => new Set<string>((o.packet.pages as { url: string }[]).map((p) => p.url.replace(/\/$/, "")));
const shared = [...urls(dup)].filter((u) => urls(into).has(u) && !/^https?:\/\/[^/]+$/.test(u));
if (!shared.length) throw new Error("these candidates do not share a non-home page; not folding");

const folded = { from_opportunity_id: dupId, title: dup.title, queries: dup.packet.queries, totals: dup.packet.totals, shared_pages: shared, reason, folded_by: "leo" };
const packet = { ...into.packet, folded_candidates: [...(into.packet.folded_candidates ?? []), folded] };
await db.from("opportunities").update({ packet }).eq("id", intoId);
await db.from("audit_events").insert({ actor: "leo", subject_type: "opportunity", subject_id: intoId, event_type: "candidate_folded_in", accepted: true, detail: { from: dupId, shared_pages: shared, reason } });
const res = await new Orchestrator(new SupabaseRepo(db)).transition("opportunity", dupId, "CANCELLED", { kind: "human", id: "leo" }, { reason: `folded into ${intoId}: ${reason}` });
if (!res.ok) throw new Error(res.reason);
await db.from("opportunities").update({ human_decision: "folded", human_reason: `Folded into ${intoId}: ${reason}` }).eq("id", dupId);
console.log(`folded "${dup.title}" into "${into.title}" via ${shared.join(", ")}; duplicate is now CANCELLED`);
