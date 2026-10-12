import { describe, expect, it } from "vitest";
import { sha256 } from "../studio/hash";
import { makeSnapshot, memoryStore, officialFetcher, pageText, snapshotIntact, snapshotToLibraryRows, verifyR1Web, type Fetcher } from "./snapshots";

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
    expect(s.passages.map((p) => p.text).join(" ")).toBe(text);
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

describe("R1 web claims are checked word for word against a stored snapshot", () => {
  it("fetches and stores the page, then accepts a verbatim quote and reports the matching passage", async () => {
    const d = deps();
    const r = await verifyR1Web(out(), d);
    expect(r.errors).toEqual([]);
    expect(d.store.all).toHaveLength(1);
    expect(d.store.all[0]).toMatchObject({ url: URL1, retrievedDate: "2026-10-12" });
    expect(r.matched.get("clm:1")?.[0]).toMatch(/^snap:/);
  });
  it("the quote check is case and whitespace tolerant, like library quotes, and nothing more", async () => {
    expect((await verifyR1Web(out([src()], [claim({ quote: "MUST  deliver a real estate transfer disclosure statement to the buyer" })]), deps())).errors).toEqual([]);
    const paraphrase = await verifyR1Web(out([src()], [claim({ quote: "must give the buyer a transfer disclosure statement" })]), deps());
    expect(paraphrase.errors.join()).toMatch(/does not appear word for word/);
    const extended = await verifyR1Web(out([src()], [claim({ quote: QUOTE + " within three days" })]), deps());
    expect(extended.errors.join()).toMatch(/does not appear word for word/);
  });
  it("a web claim without a stored snapshot is refused: the page cannot be fetched", async () => {
    const r = await verifyR1Web(out(), deps({}));
    expect(r.errors.join()).toMatch(/no stored snapshot/);
    expect(r.errors.join()).toMatch(/claim clm:1: a source it rests on has no stored snapshot/);
    expect(r.matched.size).toBe(0);
  });
  it("a supported web claim without a quote is refused, high-risk or not", async () => {
    expect((await verifyR1Web(out([src()], [claim({ quote: "" })]), deps())).errors.join()).toMatch(/word-for-word quote/);
    expect((await verifyR1Web(out([src()], [claim({ risk: "low", quote: undefined })]), deps())).errors.join()).toMatch(/needs a word-for-word quote/);
  });
  it("an unsupported claim needs no snapshot quote", async () => {
    expect((await verifyR1Web(out([src()], [claim({ support: "unsupported", quote: undefined, source_ids: [] })]), deps())).errors).toEqual([]);
  });
  it("uses a snapshot that is already stored instead of fetching again, and refuses one whose sha256 no longer matches", async () => {
    const d = deps();
    await verifyR1Web(out(), d);
    const calls: string[] = [];
    const again = await verifyR1Web(out(), { ...d, fetcher: fakeFetcher({ [URL1]: PAGE }, calls) });
    expect(again.errors).toEqual([]);
    expect(calls).toEqual([]);
    const bad = memoryStore();
    const s = makeSnapshot(URL1, "2026-10-12", PAGE);
    await bad.put({ ...s, text: s.text.replace("must deliver", "may skip") });
    expect((await verifyR1Web(out(), { ...d, store: bad })).errors.join()).toMatch(/does not match its sha256/);
  });
  it("a quote that is only in a different source's page is refused", async () => {
    const other = "https://www.courts.ca.gov/other";
    const r = await verifyR1Web(out([src(), src({ id: "src:2", url: other })], [claim({ source_ids: ["src:2"] })]), deps({ [URL1]: PAGE, [other]: "<p>Something unrelated about court forms.</p>" }));
    expect(r.errors.join()).toMatch(/does not appear word for word/);
  });
  it("a claim resting on two web sources is checked against both and needs both stored", async () => {
    const other = "https://www.courts.ca.gov/other";
    const r = await verifyR1Web(out([src(), src({ id: "src:2", url: other })], [claim({ source_ids: ["src:1", "src:2"] })]), deps({ [URL1]: PAGE }));
    expect(r.errors.join()).toMatch(/source src:2: no stored snapshot/);
  });
  it("the allowlist and legal-quote rules run first and nothing is fetched for a non-official source", async () => {
    const calls: string[] = [];
    const r = await verifyR1Web(out([src({ url: "https://www.opendoor.com/blog/x" })]), deps({ "https://www.opendoor.com/blog/x": "<p>x</p>" }, calls));
    expect(r.errors.join()).toMatch(/not on the official-source allowlist/);
    expect(calls).toEqual([]);
  });
  it("library sources are left to the library quote check", async () => {
    const r = await verifyR1Web(out([{ id: "src:1", kind: "library", library_source_id: "lib-1" }], [claim()]), deps({}));
    expect(r.errors).toEqual([]);
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
