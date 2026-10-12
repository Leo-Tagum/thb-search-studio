import { describe, expect, it } from "vitest";
import { sha256 } from "../studio/hash";
import { fulfillFetchRequest, makeSnapshot, memoryStore, officialFetcher, pageText, snapshotFromRows, snapshotIntact, snapshotToLibraryRows, verifyR1Web, type Fetcher } from "./snapshots";

const URL1 = "https://www.dre.ca.gov/disclosures";
const PAGE = `<html><head><title>x</title><style>p{color:red}</style><script>var a = "ignore me";</script></head><body>
<h1>Seller disclosures</h1>
<p>A seller of one to four residential units must deliver a Real Estate Transfer Disclosure Statement to the buyer.</p>
<p>Any waiver of these requirements is   void.</p><!-- hidden --></body></html>`;
const QUOTE = "must deliver a Real Estate Transfer Disclosure Statement to the buyer";

const fakeFetcher = (pages: Record<string, string>, calls: string[] = []): Fetcher => async (url) => {
  calls.push(url);
  return url in pages ? { ok: true, contentType: "text/html", body: pages[url] } : { ok: false, error: "HTTP 403" };
};
const src = (o: Record<string, unknown> = {}) => ({ id: "src:1", kind: "official_url", url: URL1, ...o });
const claim = (o: Record<string, unknown> = {}) => ({ id: "clm:1", support: "supported", risk: "high", quote: QUOTE, source_ids: ["src:1"], ...o });
const out = (sources: unknown[] = [src()], claims: unknown[] = [claim()]) => ({ result: { sources, claims } }) as never;
const deps = (pages: Record<string, string> = { [URL1]: PAGE }, calls: string[] = []) => ({ store: memoryStore(), fetcher: fakeFetcher(pages, calls), today: "2026-10-12" });

describe("page snapshots", () => {
  it("keeps visible text only, with sha256 and passages", () => {
    const s = makeSnapshot(URL1, "2026-10-12", PAGE);
    expect(s.text).toContain("Seller disclosures");
    expect(s.text).toContain("Any waiver of these requirements is void.");     // whitespace collapsed
    expect(s.text).not.toMatch(/ignore me|color:red|hidden|<p>/);
    expect(s.sha256).toBe(sha256(s.text));
    expect(s.passages.length).toBeGreaterThan(0);
    expect(s.passages[0].passageId).toMatch(/^snap:[0-9a-f]{12}:1$/);
    expect(snapshotIntact(s)).toBe(true);
  });
  it("decodes entities and passes plain text through", () => {
    expect(pageText("<p>Civil Code &sect; 1102 &amp; 1102.1 &#8212; ok</p>", "text/html")).toBe("Civil Code § 1102 & 1102.1 — ok");
    expect(pageText("line one\n\nline  two", "text/plain")).toBe("line one\nline two");
  });
  it("splits long pages into passages of at most about 1200 characters, losing no text", () => {
    const text = Array.from({ length: 80 }, (_, i) => `Sentence number ${i} says something about disclosure.`).join(" ");
    const s = makeSnapshot(URL1, "2026-10-12", text, "text/plain");
    expect(s.passages.length).toBeGreaterThan(2);
    expect(s.passages.every((p) => p.text.length <= 1200)).toBe(true);
    expect(s.passages.map((p) => p.text).join("\n")).toBe(s.text);                // the stored passages give back the text (and its sha256)
    expect(s.text.replace(/\s+/g, " ")).toBe(text);                                  // nothing lost, only line breaks added
  });
  it("rebuilds a snapshot from stored library rows, and refuses rows that no longer hash to the stored sha256", () => {
    const s = makeSnapshot(URL1, "2026-10-12", PAGE);
    const rows = s.passages.map((p) => ({ passage: p.text, locator: p.locator })).reverse();
    expect(snapshotFromRows(URL1, "2026-10-12", s.sha256, rows)).toEqual(s);
    expect(snapshotFromRows(URL1, "2026-10-12", s.sha256, rows.map((r) => ({ ...r, passage: r.passage.replace("must deliver", "may skip") })))).toBeNull();
  });
  it("detects a tampered snapshot", () => {
    const s = makeSnapshot(URL1, "2026-10-12", PAGE);
    expect(snapshotIntact({ ...s, text: s.text + " extra" })).toBe(false);
    expect(snapshotIntact({ ...s, passages: [{ ...s.passages[0], text: "A seller may skip the statement." }] })).toBe(false);
  });
  it("maps to Evidence Library rows with URL, retrieved date, sha256 and passages", () => {
    const s = makeSnapshot(URL1, "2026-10-12", PAGE);
    const r = snapshotToLibraryRows(s, { title: "DRE disclosures", tier: 2, jurisdiction: "California" });
    expect(r.source).toMatchObject({ source_url: URL1, retrieved_date: "2026-10-12", content_sha256: s.sha256, source_tier: 2, uploaded_by: "system:r1-snapshot" });
    expect(r.source.provenance_note).toContain(s.sha256);
    expect(r.passages).toEqual(s.passages.map((p) => ({ passage: p.text, locator: p.locator })));
  });
});

// Flow: R1 asks for URLs (fetch request) -> code fetches and stores -> R1 answers citing the stored passages by id.
const store = async (pages: Record<string, string> = { [URL1]: PAGE }, calls: string[] = []) => {
  const d = deps(pages, calls);
  const f = await fulfillFetchRequest({ ticket_id: null, fetch_request: Object.keys(pages).map((url) => ({ url, why: "needed for the disclosure claim" })) }, d);
  return { d, f };
};
const pid = (snap: { passages: { passageId: string; text: string }[] }, needle: string) => snap.passages.find((p) => p.text.includes(needle))!.passageId;

describe("R1 fetch request: code fetches, stores and returns passages", () => {
  it("fetches each requested official URL, stores it, and returns its passage ids", async () => {
    const { d, f } = await store();
    expect(f.errors).toEqual([]);
    expect(d.store.all).toHaveLength(1);
    expect(f.snapshots[0]).toMatchObject({ url: URL1, retrievedDate: "2026-10-12", sha256: d.store.all[0].sha256 });
    expect(f.snapshots[0].passages[0].passageId).toMatch(/^snap:/);
  });
  it("never fetches a non-official URL, and reports it; official ones in the same request still work", async () => {
    const calls: string[] = [];
    const d = deps({ [URL1]: PAGE, "https://www.opendoor.com/x": "<p>x</p>", "https://www.twinhomebuyer.com/y": "<p>y</p>" }, calls);
    const f = await fulfillFetchRequest({ ticket_id: "T1", fetch_request: [{ url: "https://www.opendoor.com/x", why: "competitor" }, { url: "https://www.twinhomebuyer.com/y", why: "our site" }, { url: URL1, why: "official" }] }, d);
    expect(f.errors.join()).toMatch(/opendoor.*allowlist/);
    expect(f.errors.join()).toMatch(/twinhomebuyer/);
    expect(calls).toEqual([URL1]);
    expect(f.snapshots.map((s) => s.url)).toEqual([URL1]);
  });
  it("reports a page that cannot be fetched, and a malformed or oversized request", async () => {
    const d = deps({});
    expect((await fulfillFetchRequest({ ticket_id: null, fetch_request: [{ url: URL1, why: "needed here" }] }, d)).errors.join()).toMatch(/could not be fetched/);
    expect((await fulfillFetchRequest({ nope: true }, d)).errors.length).toBeGreaterThan(0);
    expect((await fulfillFetchRequest({ ticket_id: null, fetch_request: [] }, d)).errors.length).toBeGreaterThan(0);
    const six = Array.from({ length: 6 }, (_, i) => ({ url: `https://www.dre.ca.gov/p${i}`, why: "needed here" }));
    expect((await fulfillFetchRequest({ ticket_id: null, fetch_request: six }, d)).errors.length).toBeGreaterThan(0);
    expect((await fulfillFetchRequest({ ticket_id: null, fetch_request: [{ url: URL1, why: "needed here" }], approved: true }, d)).errors.length).toBeGreaterThan(0);   // strict
  });
  it("reuses a stored snapshot instead of fetching again, and refuses one whose sha256 no longer matches", async () => {
    const { d } = await store();
    const calls: string[] = [];
    const again = await fulfillFetchRequest({ ticket_id: null, fetch_request: [{ url: URL1, why: "needed again" }] }, { ...d, fetcher: fakeFetcher({ [URL1]: PAGE }, calls) });
    expect(again.errors).toEqual([]);
    expect(calls).toEqual([]);
    const bad = memoryStore();
    const s = makeSnapshot(URL1, "2026-10-12", PAGE);
    await bad.put({ ...s, text: s.text.replace("must deliver", "may skip") });
    expect((await fulfillFetchRequest({ ticket_id: null, fetch_request: [{ url: URL1, why: "needed again" }] }, { ...d, store: bad })).errors.join()).toMatch(/does not match its sha256/);
  });
});

describe("R1 quotes only from stored passages, cited by id (never from what WebFetch showed)", () => {
  const answer = async (claimOver: Record<string, unknown> = {}, pages: Record<string, string> = { [URL1]: PAGE }) => {
    const { d, f } = await store(pages);
    const id = pid(f.snapshots[0], "must deliver");
    return { d, f, id, run: (o: Record<string, unknown> = {}) => verifyR1Web(out([src()], [claim({ passage_ids: [id], ...claimOver, ...o })]), { store: d.store }) };
  };
  it("accepts a verbatim quote from the cited stored passage and reports the matching passage", async () => {
    const { run, id } = await answer();
    const r = await run();
    expect(r.errors).toEqual([]);
    expect(r.matched.get("clm:1")).toEqual([id]);
  });
  it("the quote check is case and whitespace tolerant, like library quotes, and nothing more", async () => {
    const { run } = await answer();
    expect((await run({ quote: "MUST  deliver a real estate transfer disclosure statement to the buyer" })).errors).toEqual([]);
    expect((await run({ quote: "must give the buyer a transfer disclosure statement" })).errors.join()).toMatch(/does not appear word for word/);
    expect((await run({ quote: QUOTE + " within three days" })).errors.join()).toMatch(/does not appear word for word/);
  });
  it("a quote taken from a WebFetch summary (not on the stored page) is refused, even with a real passage id", async () => {
    const { run } = await answer();
    const webFetchSummary = "The page says sellers are required to hand buyers the disclosure form promptly.";
    expect((await run({ quote: webFetchSummary })).errors.join()).toMatch(/does not appear word for word/);
  });
  it("a web claim must cite passage ids: none, unknown ids, and ids from a source it does not cite are refused", async () => {
    const { run, f } = await answer();
    expect((await run({ passage_ids: [] })).errors.join()).toMatch(/must cite passage_ids/);
    expect((await run({ passage_ids: undefined })).errors.join()).toMatch(/must cite passage_ids/);
    expect((await run({ passage_ids: ["snap:000000000000:1"] })).errors.join()).toMatch(/is not in the stored snapshot of a source this claim cites/);
    // a second stored page that does contain the words; citing its passage while citing only source src:1 is refused
    const other = "https://www.courts.ca.gov/other";
    const { d } = await store({ [URL1]: PAGE, [other]: `<p>${QUOTE}</p>` });
    const otherId = (await d.store.get(other))!.passages[0].passageId;
    const r = await verifyR1Web(out([src(), src({ id: "src:2", url: other })], [claim({ source_ids: ["src:1"], passage_ids: [otherId] })]), { store: d.store });
    expect(r.errors.join()).toMatch(/is not in the stored snapshot of a source this claim cites/);
    expect(f.errors).toEqual([]);
  });
  it("the quote must be in the passages the claim cites, not merely somewhere on the page", async () => {
    const long = Array.from({ length: 40 }, (_, i) => `<p>Filler paragraph number ${i} about unrelated forms and fees that goes on for a while to force several passages.</p>`).join("") + `<p>${QUOTE}.</p>`;
    const { d, f } = await store({ [URL1]: long });
    const first = f.snapshots[0].passages[0].passageId;
    const last = pid(f.snapshots[0], "must deliver");
    expect(first).not.toBe(last);
    expect((await verifyR1Web(out([src()], [claim({ passage_ids: [first] })]), { store: d.store })).errors.join()).toMatch(/does not appear word for word/);
    expect((await verifyR1Web(out([src()], [claim({ passage_ids: [last] })]), { store: d.store })).errors).toEqual([]);
  });
  it("a web claim without a stored snapshot is refused, and nothing is fetched at this step", async () => {
    const r = await verifyR1Web(out([src()], [claim({ passage_ids: ["snap:abc:1"] })]), { store: memoryStore() });
    expect(r.errors.join()).toMatch(/no stored snapshot/);
    expect(r.errors.join()).toMatch(/claim clm:1: a source it rests on has no stored snapshot/);
    expect(r.matched.size).toBe(0);
  });
  it("a supported web claim without a quote is refused, high-risk or not", async () => {
    const { run } = await answer();
    expect((await run({ quote: "" })).errors.join()).toMatch(/word-for-word quote/);
    expect((await run({ risk: "low", quote: undefined })).errors.join()).toMatch(/needs a word-for-word quote/);
  });
  it("an unsupported claim needs no snapshot quote", async () => {
    const { d } = await store();
    expect((await verifyR1Web(out([src()], [claim({ support: "unsupported", quote: undefined, source_ids: [] })]), { store: d.store })).errors).toEqual([]);
  });
  it("refuses a source whose stored snapshot no longer matches its sha256", async () => {
    const bad = memoryStore();
    const s = makeSnapshot(URL1, "2026-10-12", PAGE);
    await bad.put({ ...s, text: s.text.replace("must deliver", "may skip") });
    expect((await verifyR1Web(out(), { store: bad })).errors.join()).toMatch(/does not match its sha256/);
  });
  it("a claim resting on two web sources needs both stored", async () => {
    const { d } = await store();
    const r = await verifyR1Web(out([src(), src({ id: "src:2", url: "https://www.courts.ca.gov/other" })], [claim({ source_ids: ["src:1", "src:2"], passage_ids: [(await d.store.get(URL1))!.passages[0].passageId] })]), { store: d.store });
    expect(r.errors.join()).toMatch(/source src:2: no stored snapshot/);
  });
  it("the allowlist and legal-quote rules run first, and library sources are left to the library quote check", async () => {
    const r = await verifyR1Web(out([src({ url: "https://www.opendoor.com/blog/x" })]), { store: memoryStore() });
    expect(r.errors.join()).toMatch(/not on the official-source allowlist/);
    expect((await verifyR1Web(out([{ id: "src:1", kind: "library", library_source_id: "lib-1" }], [claim()]), { store: memoryStore() })).errors).toEqual([]);
  });
});

describe("official fetcher", () => {
  const res = (status: number, body = "", headers: Record<string, string> = {}) => new Response(body, { status, headers });
  it("fetches an official page", async () => {
    const f = officialFetcher((async () => res(200, "<p>hi</p>", { "content-type": "text/html" })) as never);
    expect(await f("https://www.dre.ca.gov/x")).toMatchObject({ ok: true, body: "<p>hi</p>" });
  });
  it("refuses a non-official URL without any request", async () => {
    let called = false;
    const f = officialFetcher((async () => { called = true; return res(200); }) as never);
    expect((await f("https://www.opendoor.com/x")).ok).toBe(false);
    expect(called).toBe(false);
  });
  it("re-checks every redirect hop: an official page that redirects to a non-official host is refused", async () => {
    const f = officialFetcher((async (u: string) => (u.includes("dre.ca.gov") ? res(302, "", { location: "https://www.opendoor.com/landing" }) : res(200, "<p>ads</p>"))) as never);
    const r = await f("https://www.dre.ca.gov/x");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/allowlist/);
  });
  it("follows an official-to-official redirect, and gives up on loops, errors and failures", async () => {
    const ok = officialFetcher((async (u: string) => (u.endsWith("/old") ? res(301, "", { location: "/new" }) : res(200, "<p>moved</p>"))) as never);
    expect(await ok("https://www.dre.ca.gov/old")).toMatchObject({ ok: true });
    const loop = officialFetcher((async () => res(302, "", { location: "https://www.dre.ca.gov/again" })) as never);
    expect((await loop("https://www.dre.ca.gov/x")).ok).toBe(false);
    expect((await officialFetcher((async () => res(403)) as never)("https://www.dre.ca.gov/x")).ok).toBe(false);
    expect((await officialFetcher((async () => { throw new Error("offline"); }) as never)("https://www.dre.ca.gov/x")).ok).toBe(false);
  });
});
