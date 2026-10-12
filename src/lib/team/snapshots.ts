// Phase 3c: R1 web evidence. When R1 cites an official web page, code (not the agent) fetches the page, stores its text as an Evidence Library
// source (URL, retrieved date, sha256, passages), and checks every quote word for word against that stored text, with the same check library
// quotes get (bridge.ts norm: case and whitespace only). A web claim without a stored snapshot is refused. R1 never supplies page text:
// WebFetch output is for R1 to read, and only the stored page counts as proof.
// Pure apart from the injected fetcher and store, so the checks are tested with fakes; the service persists snapshots with snapshotToLibraryRows.
import { norm } from "../agents/bridge";
import { officialUrl } from "../agents/official-sources";
import { sha256 } from "../studio/hash";
import { r1SubmitErrors, type ResearchOutput } from "./research";

export type Passage = { passageId: string; locator: string; text: string };
export type Snapshot = { url: string; retrievedDate: string; sha256: string; text: string; passages: Passage[] };
export type Fetched = { ok: true; contentType: string; body: string } | { ok: false; error: string };
export type Fetcher = (url: string) => Promise<Fetched>;
export type SnapshotStore = { get(url: string): Promise<Snapshot | null>; put(s: Snapshot): Promise<void> };

const PASSAGE_MAX = 1200;
const MAX_BYTES = 2_000_000;

export const snapshotKey = (url: string) => { try { const u = new URL(url); u.hash = ""; return `${u.protocol}//${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`; } catch { return url; } };

const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&sect;/g, "§").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

/** Visible text of an HTML page (scripts, styles and tags removed); plain text passes through. Block ends become line breaks. */
export function pageText(body: string, contentType: string): string {
  const raw = /html|xml/i.test(contentType) || /<html|<body|<p[ >]/i.test(body)
    ? decode(body.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|table|section|article|header|footer)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    : body;
  return raw.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

/** Passages of at most ~1200 characters, split on line ends (long lines on sentence ends) and packed, so a quote of a normal length sits inside one passage. */
export function splitPassages(text: string, hash: string): Passage[] {
  const parts: string[] = [];
  for (const line of text.split("\n")) {
    if (line.length <= PASSAGE_MAX) { parts.push(line); continue; }
    let cur = "";
    for (const sent of line.split(/(?<=[.;:!?])\s+/)) { if (cur && cur.length + sent.length + 1 > PASSAGE_MAX) { parts.push(cur); cur = ""; } cur = cur ? `${cur} ${sent}` : sent; }
    if (cur) parts.push(cur);
  }
  const packed: string[] = [];
  for (const p of parts) { const last = packed[packed.length - 1]; if (last !== undefined && last.length + p.length + 1 <= PASSAGE_MAX) packed[packed.length - 1] = `${last} ${p}`; else packed.push(p); }
  return packed.map((t, i) => ({ passageId: `snap:${hash.slice(0, 12)}:${i + 1}`, locator: `p${i + 1}`, text: t }));
}

export function makeSnapshot(url: string, retrievedDate: string, body: string, contentType = "text/html"): Snapshot {
  const text = pageText(body, contentType);
  const hash = sha256(text);
  return { url, retrievedDate, sha256: hash, text, passages: splitPassages(text, hash) };
}

/** The stored text still hashes to its sha256, and the passages are exactly what that text splits into (nothing edited, added or dropped). */
export const snapshotIntact = (s: Snapshot) => sha256(s.text) === s.sha256 && JSON.stringify(splitPassages(s.text, s.sha256)) === JSON.stringify(s.passages);

export const memoryStore = (): SnapshotStore & { all: Snapshot[] } => {
  const m = new Map<string, Snapshot>();
  return { get: async (u) => m.get(snapshotKey(u)) ?? null, put: async (s) => { m.set(snapshotKey(s.url), s); }, get all() { return [...m.values()]; } };
};

/** A fetcher that only talks to official hosts: every hop of a redirect is re-checked against the allowlist. */
export function officialFetcher(fetchImpl: typeof fetch = fetch): Fetcher {
  return async (url) => {
    let cur = url;
    for (let hop = 0; hop < 4; hop++) {
      const ok = officialUrl(cur);
      if (!ok.ok) return { ok: false, error: `${cur}: ${ok.reason}` };
      let res: Response;
      try { res = await fetchImpl(cur, { redirect: "manual", headers: { "user-agent": "thb-search-studio-evidence/1.0" }, signal: AbortSignal.timeout(20_000) }); } catch (e) { return { ok: false, error: `fetch failed: ${(e as Error).message}` }; }
      if (res.status >= 300 && res.status < 400) { const loc = res.headers.get("location"); if (!loc) return { ok: false, error: "redirect without a location" }; cur = new URL(loc, cur).toString(); continue; }
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const body = await res.text();
      if (body.length > MAX_BYTES) return { ok: false, error: "page too large" };
      return { ok: true, contentType: res.headers.get("content-type") ?? "text/html", body };
    }
    return { ok: false, error: "too many redirects" };
  };
}

export type WebVerification = { errors: string[]; snapshots: Map<string, Snapshot>; matched: Map<string, string[]> };

/**
 * Everything the code checks on an R1 output before it reaches the ledger checks: the source allowlist and legal-quote rule (r1SubmitErrors),
 * then a stored snapshot for every official web source (fetched and stored here if it is not stored yet), then every supported claim that rests on a
 * web source must carry a quote that appears word for word in a stored passage of a source it cites. `matched` lists the passage ids that contain each quote.
 */
export async function verifyR1Web(out: ResearchOutput, deps: { store: SnapshotStore; fetcher: Fetcher; today: string }): Promise<WebVerification> {
  const res: WebVerification = { errors: r1SubmitErrors(out), snapshots: new Map(), matched: new Map() };
  if (res.errors.length) return res;
  const sources = out.result?.sources ?? [];
  const web = sources.filter((s) => s.kind === "official_url" && s.url);
  for (const s of web) {
    let snap = await deps.store.get(s.url!);
    if (!snap) {
      const f = await deps.fetcher(s.url!);
      if (!f.ok) { res.errors.push(`source ${s.id}: no stored snapshot, and the page could not be fetched (${f.error}); a web claim without a stored snapshot is refused`); continue; }
      snap = makeSnapshot(s.url!, deps.today, f.body, f.contentType);
      if (!snap.text) { res.errors.push(`source ${s.id}: the page has no readable text`); continue; }
      await deps.store.put(snap);
    }
    if (!snapshotIntact(snap)) { res.errors.push(`source ${s.id}: the stored snapshot does not match its sha256`); continue; }
    res.snapshots.set(s.id!, snap);
  }
  for (const c of out.result?.claims ?? []) {
    if (c.support !== "supported") continue;
    const cited = (c.source_ids ?? []).map((id) => sources.find((s) => s.id === id)).filter((s) => s?.kind === "official_url");
    if (!cited.length) continue;
    const snaps = cited.map((s) => res.snapshots.get(s!.id!));
    if (snaps.some((x) => !x)) { res.errors.push(`claim ${c.id}: a source it rests on has no stored snapshot`); continue; }
    const quote = norm(c.quote ?? "");
    if (!quote) { res.errors.push(`claim ${c.id}: a supported web claim needs a word-for-word quote`); continue; }
    const hits = snaps.flatMap((x) => x!.passages).filter((p) => norm(p.text).includes(quote)).map((p) => p.passageId);
    if (!hits.length) res.errors.push(`claim ${c.id}: the quote does not appear word for word in the stored page`);
    else res.matched.set(c.id!, hits);
  }
  return res;
}

/** Rows for the Evidence Library tables (evidence_sources + evidence_passages); the same shape the library import writes. */
export function snapshotToLibraryRows(s: Snapshot, meta: { title: string; tier: number; jurisdiction: string; effectiveDate?: string | null }) {
  return {
    source: { title: meta.title, source_url: s.url, source_tier: meta.tier, jurisdiction: meta.jurisdiction, effective_date: meta.effectiveDate ?? null, retrieved_date: s.retrievedDate, uploaded_by: "system:r1-snapshot", provenance_note: `Official page text fetched by code on ${s.retrievedDate}; sha256 ${s.sha256}`, content_sha256: s.sha256 },
    passages: s.passages.map((p) => ({ passage: p.text, locator: p.locator })),
  };
}
