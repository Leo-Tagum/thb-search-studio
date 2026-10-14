/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { advancePlan, createImageVersion, imagesForProposal, leoCheckImages, recordImagePlan, storeImages, type ImageStore, type PlanCardInput } from "./image-pilot";
import { pullImages, type BoardWork } from "./image-pull";
import { makePng } from "./image-files.testlib";
import { memDb } from "./memdb.testlib";
import { composeAuthor, composeCta, renderBody, type BrandFactRow, type Composed } from "./template";
import { sha256 } from "./hash";
import type { Draft } from "./schema";

// Real-pilot wiring (Leo, 2026-10-14): plan, bucket + image_uploads rows, Leo's check, the image-bearing version, the proposal's image block. FAKE article, synthetic files, in-memory database and bucket.
const facts: BrandFactRow[] = [{ fact_key: "experience_total", fact_value: "25+ years of experience in Bay Area real estate", status: "approved" }, { fact_key: "industry_experience", fact_value: "Juan Diaz has been investing in Bay Area real estate since 2002", status: "approved" }, { fact_key: "homes_purchased", fact_value: "1,000+", status: "approved" }, { fact_key: "company_name", fact_value: "Twin Home Buyer", status: "approved" }];
const composed: Composed = { author: composeAuthor(facts, "https://www.twinhomebuyer.com/from-the-desk-of-juan-diaz/"), related: [], sources: [{ label: "California Legislative Information, Civil Code §1102", url: "https://leginfo.legislature.ca.gov/x" }], cta: composeCta("https://www.twinhomebuyer.com/hoarder-houses/") };
const draft: Draft = { title: "T", slug: "t", units: [
  { kind: "section", key: "s1", h2: "Can you sell a packed house?", capsule: "Yes.", blocks: [{ t: "p", text: "Start with who holds title." }, { t: "ol", items: ["Who has authority to sign?", "What is owed?"] }], claim_ids: [], roles: [] },
  { kind: "section", key: "s2", h2: "What does state law list?", blocks: [{ t: "p", text: "Ask the city or county." }], claim_ids: [], roles: [] },
  { kind: "faq", key: "faq", items: [{ q: "Q1?", a: "A1.", claim_ids: [] }, { q: "Q2?", a: "A2.", claim_ids: [] }, { q: "Q3?", a: "A3.", claim_ids: [] }] },
] };
const HTML = renderBody(draft, composed);
const HASH = sha256(HTML);
const card = (id: string, unit: string, after: string): PlanCardInput => ({ card_id: id, unit_key: unit, unit_hash: "u", anchor: { after, block_index: 0 }, card_version: 1, aspect_ratio: { ratio: "16:9", width_px: 1600, height_px: 900 }, base_file_name: `fx_${unit}`, alt_text: "A checklist of three first questions.", title: "t", type: "diagram", purpose: "Show the first questions in order", design_brief: "A simple checklist", generation_prompt: "a checklist", avoid: [], priority: "high", privacy_notes: "none", text_overlay: [], claim_ids: [] });
const cards = [card("img:1", "s1", "Can you sell a packed house?"), card("img:2", "s2", "What does state law list?")];

function world(over: Record<string, unknown> = {}) {
  const m = memDb({
    articles: [{ id: "a1", state: "HUMAN_REVIEW", prior_state: "DRAFTING", revision_count: 0, version_hash: HASH, approved_hash: null, locked_version_id: "v1", ...over }],
    article_versions: [{ id: "v1", article_id: "a1", version_hash: HASH, body: { draft, composed, html: HTML } }],
    proposals: [], image_plans: [], image_cards: [], image_uploads: [], audit_events: [],
  });
  const bucket = new Map<string, Uint8Array>();
  const store: ImageStore = { async upload(p, d) { if (bucket.has(p)) throw new Error("exists"); bucket.set(p, d); }, async signedUrl(p) { return `https://signed.example/${p}?t=1`; } };
  return { m, bucket, store };
}
const board = (): { work: BoardWork[]; files: Map<string, Uint8Array> } => ({
  files: new Map([["a1", makePng(1600, 900, [], 1)], ["a2", makePng(1600, 900, [], 2)]]),
  work: ["img:1", "img:2"].map((id, i) => ({ card_id: id, read: true, made: true, words: true, done: true, base: 0, uploads: [{ v: 1, for_card_version: 1, file_name: "x.png", date: "2026-10-14", asset_id: `a${i + 1}` }] })),
});
const refs = cards.map(({ card_id, unit_key, anchor, card_version, aspect_ratio, base_file_name, alt_text }) => ({ card_id, unit_key, anchor, card_version, aspect_ratio, base_file_name, alt_text }));
const pull = () => { const b = board(); return pullImages({ articleId: "a1", cards: refs, work: b.work, files: b.files, uploader: "Lawrence" }); };
async function ready(w = world()) {
  const rec = await recordImagePlan(w.m.db, "a1", cards, "leo"); if (!rec.ok) throw new Error(rec.reason);
  for (const s of ["V1_CHECKED", "ON_BOARD"] as const) await advancePlan(w.m.db, rec.planId, s, "leo");
  const st = await storeImages(w.m.db, rec.planId, pull(), w.store); if (!st.ok) throw new Error(st.reason);
  return { ...w, planId: rec.planId };
}

describe("the plan", () => {
  it("only Leo records it, only on an assembled unapproved article; a new plan supersedes the old one", async () => {
    const w = world();
    expect((await recordImagePlan(w.m.db, "a1", cards, "lawrence")).ok).toBe(false);
    const a = await recordImagePlan(w.m.db, "a1", cards, "leo"); expect(a.ok).toBe(true);
    const b = await recordImagePlan(w.m.db, "a1", cards, "leo"); expect(b.ok).toBe(true);
    expect(w.m.t.image_plans.map((p: any) => p.status)).toEqual(["SUPERSEDED", "PLANNED"]);
    expect(w.m.t.image_plans[1].text_version_hash).toBe(HASH);
    expect(w.m.t.image_cards.filter((c: any) => c.plan_id === w.m.t.image_plans[1].id)).toHaveLength(2);
    const approved = world({ approved_hash: HASH, state: "APPROVED_FOR_WP_DRAFT" });
    expect((await recordImagePlan(approved.m.db, "a1", cards, "leo")).ok).toBe(false);
  });
  it("statuses go forward only; LEO_CHECKED only through Leo's check", async () => {
    const w = world(); const r = await recordImagePlan(w.m.db, "a1", cards, "leo"); if (!r.ok) throw new Error();
    expect((await advancePlan(w.m.db, r.planId, "ON_BOARD", "leo")).ok).toBe(false);          // cannot skip V1
    expect((await advancePlan(w.m.db, r.planId, "V1_CHECKED", "leo")).ok).toBe(true);
    expect((await advancePlan(w.m.db, r.planId, "PLANNED", "leo")).ok).toBe(false);          // no going back
    expect((await advancePlan(w.m.db, r.planId, "LEO_CHECKED", "leo")).ok).toBe(false);
  });
});

describe("storing the images", () => {
  it("writes the cleaned files to the bucket and one image_uploads row each; the plan becomes ALL_DONE", async () => {
    const w = await ready();
    expect(w.bucket.size).toBe(2);
    expect(w.m.t.image_uploads).toHaveLength(2);
    expect(w.m.t.image_uploads[0]).toMatchObject({ version_no: 1, mime: "image/png", leo_check: null });
    expect(w.m.t.image_plans[0].status).toBe("ALL_DONE");
  });
  it("is idempotent for the same bytes and never overwrites different bytes for the same card version", async () => {
    const w = await ready();
    const again = await storeImages(w.m.db, w.planId, pull(), w.store);
    expect(again).toMatchObject({ ok: true, stored: 0, skipped: 2 });                      // same bytes again: nothing written twice
    const w2 = world(); const r = await recordImagePlan(w2.m.db, "a1", cards, "leo"); if (!r.ok) throw new Error();
    for (const s of ["V1_CHECKED", "ON_BOARD"] as const) await advancePlan(w2.m.db, r.planId, s, "leo");
    const p1 = pull(); const one = { ...p1, ready: [p1.ready[0]] };
    expect(await storeImages(w2.m.db, r.planId, one, w2.store)).toMatchObject({ ok: true, stored: 1 });
    expect(await storeImages(w2.m.db, r.planId, one, w2.store)).toMatchObject({ ok: true, stored: 0, skipped: 1 });
    const other = { ...one, ready: [{ ...p1.ready[0], sha256: "f".repeat(64) }] };
    const res = await storeImages(w2.m.db, r.planId, other, w2.store);
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toContain("never overwritten");
    expect(w2.m.t.image_uploads).toHaveLength(1);
  });
  it("refuses a file whose bytes do not hash to the recorded SHA-256, and a plan that is not on the board", async () => {
    const w = world(); const r = await recordImagePlan(w.m.db, "a1", cards, "leo"); if (!r.ok) throw new Error();
    expect((await storeImages(w.m.db, r.planId, pull(), w.store)).ok).toBe(false);          // PLANNED
    for (const s of ["V1_CHECKED", "ON_BOARD"] as const) await advancePlan(w.m.db, r.planId, s, "leo");
    const p = pull(); p.files.set(p.ready[0].storage_path, makePng(1600, 900, [], 77));
    const res = await storeImages(w.m.db, r.planId, p, w.store);
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toContain("does not hash");
    expect(w.bucket.size).toBe(0); expect(w.m.t.image_uploads).toHaveLength(0);
  });
});

describe("Leo's check and the image-bearing version", () => {
  it("only Leo checks; every card must have an image; the check is recorded on each", async () => {
    const w = await ready();
    expect((await leoCheckImages(w.m.db, w.planId, "looked at all two", "lawrence")).ok).toBe(false);
    expect((await leoCheckImages(w.m.db, w.planId, "ok", "leo")).ok).toBe(false);          // a note is needed
    expect(await leoCheckImages(w.m.db, w.planId, "looked at both pictures", "leo", "2026-10-15")).toMatchObject({ ok: true, checked: 2 });
    expect(w.m.t.image_uploads.every((u: any) => u.leo_check?.checked_by === "Leo")).toBe(true);
    expect(w.m.t.image_plans[0].status).toBe("LEO_CHECKED");
  });
  it("is refused until the plan is LEO_CHECKED", async () => {
    const w = await ready();
    const r = await createImageVersion(w.m.db, "a1", w.planId, "leo");
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toContain("LEO_CHECKED");
  });
  it("adds figures without touching the text: new hash, text-only hash equals the planned text, old approval cleared, article stays in HUMAN_REVIEW", async () => {
    const w = await ready(); await leoCheckImages(w.m.db, w.planId, "looked at both pictures", "leo");
    const r = await createImageVersion(w.m.db, "a1", w.planId, "leo");
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.figures).toBe(2); expect(r.textOnlyHash).toBe(HASH); expect(r.hash).not.toBe(HASH);
    const v = w.m.t.article_versions.at(-1);
    expect(v.body.html).toContain("studio-image:"); expect(v.body.images).toHaveLength(2); expect(v.body.text_only_hash).toBe(HASH);
    expect(w.m.t.articles[0]).toMatchObject({ state: "HUMAN_REVIEW", version_hash: r.hash, locked_version_id: v.id, approved_hash: null });
    expect(w.m.t.audit_events.some((e: any) => e.event_type === "image_version_created")).toBe(true);
  });
  it("is refused for an approved article, a different article's plan, and a text that changed after the plan (the plan goes STALE)", async () => {
    const w = await ready(); await leoCheckImages(w.m.db, w.planId, "looked at both pictures", "leo");
    expect((await createImageVersion(w.m.db, "a1", w.planId, "lawrence")).ok).toBe(false);
    w.m.t.articles[0].approved_hash = HASH;
    const a = await createImageVersion(w.m.db, "a1", w.planId, "leo"); expect(a.ok).toBe(false);
    w.m.t.articles[0].approved_hash = null;
    const newHtml = HTML.replace("Start with who holds title.", "Start with who holds title. Then check.");
    w.m.t.article_versions[0].body.html = newHtml; w.m.t.articles[0].version_hash = sha256(newHtml);
    const s = await createImageVersion(w.m.db, "a1", w.planId, "leo");
    expect(s.ok).toBe(false); if (!s.ok) expect(s.reason).toContain("STALE");
    expect(w.m.t.image_plans[0].status).toBe("STALE");
  });
});

describe("the image block of the proposal", () => {
  it("is null for a text-only version; for an image version it lists the pictures with signed addresses and Leo's check", async () => {
    const w = await ready(); await leoCheckImages(w.m.db, w.planId, "looked at both pictures", "leo");
    expect(await imagesForProposal(w.m.db, w.m.t.article_versions[0], new Map(), w.store)).toBeNull();
    const r = await createImageVersion(w.m.db, "a1", w.planId, "leo"); if (!r.ok) throw new Error(r.reason);
    const block = await imagesForProposal(w.m.db, w.m.t.article_versions.at(-1), new Map(), w.store);
    expect(block).not.toBeNull();
    expect(JSON.stringify(block)).toContain("https://signed.example/articles/a1/");
    expect(JSON.stringify(block)).toContain("looked at both pictures");
  });
});

describe("buildProposalPayload with images", () => {
  it("carries the image block for an image version, and refuses to build without the store (never a proposal without its pictures)", async () => {
    const { buildProposalPayload } = await import("./proposal-payload");
    const w = await ready(); await leoCheckImages(w.m.db, w.planId, "looked at both pictures", "leo");
    const r = await createImageVersion(w.m.db, "a1", w.planId, "leo"); if (!r.ok) throw new Error(r.reason);
    const v = w.m.t.article_versions.at(-1);
    Object.assign(w.m.t, { article_sections: [], claims: [], evidence_sources: [], section_reviews: [], briefs: [{ id: "b1", outline: {} }] });
    w.m.t.articles[0].brief_id = "b1"; w.m.t.articles[0].title = "T"; w.m.t.articles[0].slug = "t";
    w.m.t.proposals.push({ id: "p9", article_id: "a1", article_version_id: v.id, voice_snapshot: null, requires_secondary: false, status: "OPEN", created_at: "2026-10-15T10:00:00.000Z" });
    await expect(buildProposalPayload(w.m.db, "p9")).rejects.toThrow(/carries images/);
    const payload: any = await buildProposalPayload(w.m.db, "p9", w.store);
    expect(payload.images).toHaveLength(2);
    expect(Object.values(payload.image_urls)[0]).toContain("https://signed.example/");
    expect(payload.html).toContain("studio-image:");                                       // stored tokens, never signed addresses
    expect(payload.html).not.toContain("signed.example");
  });
});
