// Phase 3c: R1 web evidence, in two steps (Leo, 2026-10-12). R1 never quotes from what WebFetch showed it (WebFetch can summarize).
//   1. DISCOVER: R1 uses WebFetch only to find which official URL to rely on, and asks for it in a fetch request.
//   2. Code fetches each requested URL itself (official-domain allowlist on every redirect hop), stores the page text as an Evidence Library
//      source (URL, retrieved date, sha256, passages), and hands the stored passages back to R1.
//   3. ANSWER: R1 cites those passages by id, like library sources. A claim must carry passage_ids and a short quote that appears word for word
//      (case and whitespace only, bridge.ts norm) inside those stored passages. A web claim without a stored snapshot, without passage ids, or with
//      a quote that is not on the stored page is refused.
// Pure apart from the injected fetcher and store, so the checks are tested with fakes; the service persists snapshots with snapshotToLibraryRows.
import { norm } from "../agents/bridge";
import { officialUrl } from "../agents/official-sources";
import { sha256 } from "../studio/hash";
import { z } from "zod";
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
  // Canonical text: one line per block, and a line longer than a passage is broken at sentence ends into several lines. So the passages are
  // exactly the text split into groups of lines, and the stored passages joined with a line break give back the text (and its sha256).
  const lines: string[] = [];
  for (const line of raw.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    if (line.length <= PASSAGE_MAX) { lines.push(line); continue; }
    let cur = "";
    for (const sent of line.split(/(?<=[.;:!?])\s+/)) { if (cur && cur.length + sent.length + 1 > PASSAGE_MAX) { lines.push(cur); cur = ""; } cur = cur ? `${cur} ${sent}` : sent; }
    if (cur) lines.push(cur);
  }
  return lines.join("\n");
}

/** Passages of at most ~1200 characters: whole lines packed together (joined by a line break), so a quote of a normal length sits inside one passage. */
export function splitPassages(text: string, hash: string): Passage[] {
  const packed: string[] = [];
  for (const line of text.split("\n")) { const last = packed[packed.length - 1]; if (last !== undefined && last.length + line.length + 1 <= PASSAGE_MAX) packed[packed.length - 1] = `${last}\n${line}`; else packed.push(line); }
  return packed.map((t, i) => ({ passageId: `snap:${hash.slice(0, 12)}:${i + 1}`, locator: `p${i + 1}`, text: t }));
}

/** Rebuilds a stored snapshot from its Evidence Library rows (passages in locator order); null when the rows do not hash to the stored sha256. */
export function snapshotFromRows(url: string, retrievedDate: string, sha: string, passages: { passage: string; locator: string | null }[]): Snapshot | null {
  const ordered = [...passages].sort((x, y) => Number((x.locator ?? "p0").slice(1)) - Number((y.locator ?? "p0").slice(1)));
  const text = ordered.map((p) => p.passage).join("\n");
  const snap: Snapshot = { url, retrievedDate, sha256: sha, text, passages: splitPassages(text, sha) };
  return snapshotIntact(snap) ? snap : null;
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

// ---------- step 1-2: the fetch request and its fulfilment ----------
export const r1FetchRequest = z.strictObject({
  ticket_id: z.string().nullable(),
  fetch_request: z.array(z.strictObject({ url: z.string().min(8), why: z.string().min(5) })).min(1).max(5),
});
export type SnapshotForPacket = { url: string; retrievedDate: string; sha256: string; passages: Passage[] };

/**
 * Validates R1's fetch request, fetches each official URL itself, stores the snapshot, and returns the stored passages for R1's second run.
 * A URL outside the allowlist is never fetched. A page that cannot be fetched is reported back; R1 then cannot rely on it.
 */
export async function fulfillFetchRequest(raw: unknown, deps: { store: SnapshotStore; fetcher: Fetcher; today: string }): Promise<{ errors: string[]; snapshots: SnapshotForPacket[] }> {
  const p = r1FetchRequest.safeParse(raw);
  if (!p.success) return { errors: p.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`), snapshots: [] };
  const errors: string[] = [];
  const snapshots: SnapshotForPacket[] = [];
  const seen = new Set<string>();
  for (const { url } of p.data.fetch_request) {
    const ok = officialUrl(url);
    if (!ok.ok) { errors.push(`${url}: ${ok.reason}`); continue; }
    if (seen.has(snapshotKey(url))) continue;
    seen.add(snapshotKey(url));
    let snap = await deps.store.get(url);
    if (!snap) {
      const f = await deps.fetcher(url);
      if (!f.ok) { errors.push(`${url}: could not be fetched (${f.error}); do not rely on it`); continue; }
      snap = makeSnapshot(url, deps.today, f.body, f.contentType);
      if (!snap.text) { errors.push(`${url}: the page has no readable text`); continue; }
      await deps.store.put(snap);
    }
    if (!snapshotIntact(snap)) { errors.push(`${url}: the stored snapshot does not match its sha256`); continue; }
    snapshots.push({ url: snap.url, retrievedDate: snap.retrievedDate, sha256: snap.sha256, passages: snap.passages });
  }
  return { errors, snapshots };
}

// ---------- step 3: the answer ----------
/**
 * Everything the code checks on an R1 evidence pack before it reaches the ledger checks: the source allowlist and legal-quote rule (r1SubmitErrors),
 * then a STORED snapshot for every official web source (nothing is fetched here), then every supported claim that rests on a web source must cite
 * passage_ids that belong to the stored snapshot of a source it cites, with a quote that appears word for word in those passages.
 * `matched` lists the passage ids each claim's quote was found in.
 */
export async function verifyR1Web(out: ResearchOutput, deps: { store: SnapshotStore }): Promise<WebVerification> {
  const res: WebVerification = { errors: r1SubmitErrors(out), snapshots: new Map(), matched: new Map() };
  if (res.errors.length) return res;
  const sources = out.result?.sources ?? [];
  for (const s of sources.filter((x) => x.kind === "official_url" && x.url)) {
    const snap = await deps.store.get(s.url!);
    if (!snap) { res.errors.push(`source ${s.id}: no stored snapshot; request the URL in a fetch request first (a web claim without a stored snapshot is refused)`); continue; }
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
    const pids = c.passage_ids ?? [];
    if (!pids.length) { res.errors.push(`claim ${c.id}: a supported web claim must cite passage_ids from the stored snapshot (quote only from stored passages)`); continue; }
    const all = new Map(snaps.flatMap((x) => x!.passages).map((p) => [p.passageId, p]));
    const unknown = pids.filter((id) => !all.has(id));
    if (unknown.length) { res.errors.push(`claim ${c.id}: passage ${unknown.join(", ")} is not in the stored snapshot of a source this claim cites`); continue; }
    const hits = pids.filter((id) => norm(all.get(id)!.text).includes(quote));
    if (!hits.length) res.errors.push(`claim ${c.id}: the quote does not appear word for word in the cited stored passages`);
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
