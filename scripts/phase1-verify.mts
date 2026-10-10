// Phase 1 final DB verification (counts only; never prints seller text).
import { createClient } from "@supabase/supabase-js";
import { checkPublishable } from "../src/lib/seller/identity";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
await db.from("articles").delete().eq("title", "SMOKE TEST (dummy)");
const briefs = await db.from("seller_briefs").select("case_id,review_status");
const passages = await db.from("seller_brief_passages").select("visibility,text,not_for_publication").limit(2000);
const pub = passages.data!.filter((p) => p.visibility === "publishable");
const badPub = pub.filter((p) => !checkPublishable(p.text).ok).length;
const internalNotFlagged = passages.data!.filter((p) => p.visibility === "internal_only" && !p.not_for_publication).length;
const pages = await db.from("pages").select("protection_status,template_flag,wp_type,meta_title");
const cnt = (f: (r: NonNullable<typeof pages.data>[number]) => boolean) => pages.data!.filter(f).length;
const out = {
  briefs: briefs.data!.length,
  pendingReview: briefs.data!.filter((b) => b.review_status === "pending_review").map((b) => b.case_id),
  publishablePassages: pub.length, publishableFailingIdentityCheck: badPub, internalNotMarkedNotForPublication: internalNotFlagged,
  pages: pages.data!.length, posts: cnt((r) => r.wp_type === "post"), pagesType: cnt((r) => r.wp_type === "page"),
  protectionUnknown: cnt((r) => r.protection_status === "unknown"), cityTemplate: cnt((r) => r.template_flag === "city"),
  renderedTitlesFetched: cnt((r) => !!r.meta_title),
};
console.log(JSON.stringify(out));
if (out.briefs !== 21 || badPub || internalNotFlagged) { console.error("FAIL"); process.exit(1); }
console.log("PASS");
