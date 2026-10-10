// Human redirect of an approved opportunity: protect the money page, switch the action to CREATE of a separate
// informational guide, send the brief back for revision. Usage: npm run redirect:create  (hoarder case, Leo 2026-10-10)
// Actor is "leo" because it executes Leo's instruction; every step writes an audit event.
import { createClient } from "@supabase/supabase-js";
import { Orchestrator } from "../src/lib/orchestrator";
import { SupabaseRepo } from "../src/lib/orchestrator/supabase-repo";
import { markProtection, type Protection } from "../src/lib/protection";

const OPP = "1d78c9e3-6b2d-4434-88ed-56b905e67c24";
const MONEY = "https://www.twinhomebuyer.com/hoarder-houses/";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data: page } = await db.from("pages").select("id,protection_status").eq("canonical_url", MONEY).single();
if (!page) throw new Error("money page not in inventory");
await markProtection({
  getStatus: async () => page.protection_status as Protection,
  setStatus: async (id, s, r, actor) => { const { error } = await db.from("pages").update({ protection_status: s, protection_reason: r, protection_marked_by: actor, protection_marked_at: new Date().toISOString() }).eq("id", id); if (error) throw error; },
  appendAudit: async (e) => { const { error } = await db.from("audit_events").insert(e); if (error) throw error; },
}, page.id, "protected", "Confirmed money page (Leo, 2026-10-10): no changes to /hoarder-houses/. Link to it only.", "leo");

const redirect = {
  by: "leo", at: new Date().toISOString(), supersedes: "UPDATE of /hoarder-houses/ (protected money page)",
  new_action: "CREATE", page_type: "separate informational guide post",
  new_intent: "Informational only: seller disclosure when selling a house in California, what to do with a packed or hoarded house, and cleanout before selling. NOT the commercial intent 'sell hoarder house'.",
  forbidden_target_phrases: ["sell hoarder house", "sell my hoarder house", "sell a hoarder house", "sell your hoarder house", "we buy hoarder", "cash for hoarder", "hoarder house buyer"],
  required_links: [MONEY],
  link_topic_regex: "(lien|code-violation|title-issue|inherit|authority|executor|as-is|delay|repair|tenant|probate)",
  directive: "/hoarder-houses/ is a confirmed money page and must not change. Convert the existing brief into a CREATE for a SEPARATE informational guide post: topics are disclosure when selling in California, what to do with a packed or hoarded house, and cleanout before selling. Do NOT target the commercial query 'sell hoarder house' in the title, answer capsule or H2s, and map commercial fan-out queries to existing_page (the money page) or exclude. The guide must link to https://www.twinhomebuyer.com/hoarder-houses/ as the next step (required). Add a link plan using ONLY URLs from link_candidates in the data block (inventory); prefer informational posts; do not invent URLs. Keep all sourced claims (clm ids from Agent 2 only, no extension), all open items and all PENDING JUAN items from the earlier brief (add: suggested URL slug and that the live page is new, so nothing is untouched). Seller Situation Map, honest options, warnings and professional confirmation are still required.",
};
const { data: o } = await db.from("opportunities").select("human_reason,state").eq("id", OPP).single();
await db.from("opportunities").update({
  action: "CREATE", redirect, protected_warning: false, dev_change_request: false, template_flag: null,
  target_intent: redirect.new_intent, human_reason: `${o!.human_reason} | REDIRECT 2026-10-10: ${redirect.supersedes} -> CREATE separate informational guide`,
}).eq("id", OPP);
await db.from("decisions").insert({ opportunity_id: OPP, decision: "redirect_to_create", rationale: redirect.directive.slice(0, 400), decided_by: "leo" });
const res = await new Orchestrator(new SupabaseRepo(db)).transition("opportunity", OPP, "REVISION_REQUIRED", { kind: "human", id: "leo" }, { reason: "redirect: UPDATE of protected money page -> CREATE separate informational guide", prior_state: o!.state });
if (!res.ok) throw new Error(res.reason);
await db.from("audit_events").insert({ actor: "leo", subject_type: "opportunity", subject_id: OPP, event_type: "redirected_to_create", accepted: true, detail: { money_page: MONEY, forbidden: redirect.forbidden_target_phrases } });
console.log("redirected; opportunity state:", res.subject.state);
