// Phase 3e stage 2: submit-time checks for legal claims ("Legal claims: no guessing", Leo's standing rule, 2026-10-13), shared by Agent 2 and R1.
// A high-risk claim is a legal claim (the research prompts define legal, permit, tax, disclosure and foreclosure claims as high risk). A SUPPORTED high-risk
// claim is accepted only with its whole verification record: the exact official quote, the section, what it was read from, a MATCH / NARROWER / BROADER / WRONG
// label, the gates the quoted section puts on the rule and whether an omission changes what a reader would believe or do. The record rests on Evidence Library
// sources (Leo's official prints) only: a fetched web page cannot support a high-risk legal claim. The code refuses; it never repairs and never guesses.
// An unsupported claim needs none of this (it cannot reach the ledger).
import { QUOTE_MAX } from "../studio/legal-claims";

export type LegalClaim = {
  id?: string; support?: string; risk?: string; claim_type?: string; source_ids?: string[]; passage_ids?: string[]; quote?: string | null; section?: string | null;
  verification?: { label?: string; reason?: string | null; against?: string; reader_impact?: string } | null;
  gates?: { kind?: string; text?: string; stated_in_claim?: boolean; carried_by?: string }[] | null;
};
export type LegalSource = { id?: string; kind?: string; library_source_id?: string };
export type LegalCtx = {
  libraryPassages?: Map<string, { source_id: string; text: string }>;
  librarySources?: Map<string, { recheck_by: string | null; needs_reprint?: boolean }>;   // evidence_sources.id -> its recheck_by date
  today?: string;                                               // yyyy-mm-dd (tests inject it)
};

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
const isLegal = (c: LegalClaim) => c.support === "supported" && (c.risk === "high" || c.risk === "critical");

/** The checks that need only the output itself (no database): the record is complete, consistent, and rests on library sources. */
export function legalStaticErrors(claims: LegalClaim[], sources: LegalSource[]): string[] {
  const errs: string[] = [];
  const byId = new Map(sources.map((s) => [s.id, s]));
  const packet = new Map(claims.map((c) => [c.id, c]));
  for (const c of claims) {
    if (!isLegal(c)) continue;
    const at = `claim ${c.id}`;
    const quote = (c.quote ?? "").trim();
    if (!quote) errs.push(`${at}: a legal claim needs the full exact official quote (word for word); if the official text cannot be reached or is unclear, stop and ask Leo for a print`);
    if (quote.length > QUOTE_MAX) errs.push(`${at}: quote is longer than ${QUOTE_MAX} characters`);
    if (!(c.section ?? "").trim()) errs.push(`${at}: a legal claim needs its section and subsection (for example "H&S 17920.3(a)(12)")`);
    // library only: a fetched page cannot support a high-risk legal claim
    if (!(c.source_ids ?? []).length) errs.push(`${at}: a legal claim needs an Evidence Library source`);
    for (const sid of c.source_ids ?? []) {
      const s = byId.get(sid);
      if (s && s.kind !== "library") errs.push(`${at}: a legal claim must rest on an Evidence Library source (Leo's official print), not ${sid} (${s.kind}); ask Leo for a print`);
    }
    const v = c.verification;
    if (!v) { errs.push(`${at}: a legal claim needs its verification: label (MATCH, NARROWER, BROADER or WRONG), what it was read from, and reader_impact`); continue; }
    if (!v.label) errs.push(`${at}: verification needs a label (MATCH, NARROWER, BROADER or WRONG)`);
    if (!(v.against ?? "").trim()) errs.push(`${at}: verification needs "against": what the quote was read from`);
    if (!v.reader_impact) errs.push(`${at}: verification needs reader_impact (none or changes)`);
    if (!Array.isArray(c.gates)) errs.push(`${at}: a legal claim needs a gates list (the thresholds, exceptions, alternative deciders and scopes of the quoted section; an empty list says it has none)`);
    if (c.claim_type === "statute_absence" && (v.reason ?? "").trim().length < 20) errs.push(`${at}: an absence-of-law claim (statute_absence) needs in verification.reason the search done: which official text was read in full, on what date, and that the term does not appear`);
    if (v.label === "BROADER" || v.label === "WRONG") errs.push(`${at}: labelled ${v.label}: it says more than, or contradicts, the official text; fix the claim or mark it unsupported`);
    if (v.reader_impact === "changes") errs.push(`${at}: reader_impact is "changes": what the claim omits changes what a reader would believe or do; fix the claim (or carry the gate in another claim) before it can be supported`);
    if (v.label === "MATCH" && v.reader_impact === "changes") errs.push(`${at}: MATCH cannot have reader_impact "changes"`);
    if (v.label === "NARROWER" && !(v.reason ?? "").trim()) errs.push(`${at}: NARROWER needs a recorded reason why the omission does not change what a reader would believe or do`);
    if (v.label === "NARROWER" && v.reader_impact !== "none") errs.push(`${at}: NARROWER is acceptable only with reader_impact "none"`);
    for (const g of c.gates ?? []) {
      if (!g.carried_by) continue;
      const other = packet.get(g.carried_by);
      if (!other) errs.push(`${at}: gate "${(g.text ?? "").slice(0, 40)}" is carried by ${g.carried_by}, which is not a claim in this packet`);
      else if (other.support !== "supported") errs.push(`${at}: gate carried by ${g.carried_by}, which is not supported`);
      // a gate may be both stated in the claim and carried by another claim (redundant, not wrong): the carrier is still validated above
    }
    // an omitted gate (neither stated in the claim nor carried by another claim) needs the recorded reason
    const omitted = (c.gates ?? []).filter((g) => !g.stated_in_claim && !g.carried_by);
    if (omitted.length && v.reader_impact === "none" && !(v.reason ?? "").trim()) errs.push(`${at}: ${omitted.length} gate(s) of the quoted section are not stated in the claim; record the reason the omission changes nothing for a reader`);
  }
  return errs;
}

/** The checks that need the Evidence Library: the quote is verbatim in the cited passages, and the cited source has a recheck date that has not passed. */
export function legalLibraryErrors(claims: LegalClaim[], sources: LegalSource[], ctx: LegalCtx): string[] {
  const errs: string[] = [];
  const byId = new Map(sources.map((s) => [s.id, s]));
  const today = ctx.today ?? new Date().toISOString().slice(0, 10);
  for (const c of claims) {
    if (!isLegal(c)) continue;
    const at = `claim ${c.id}`;
    const libs = (c.source_ids ?? []).map((sid) => byId.get(sid)).filter((s): s is LegalSource => s?.kind === "library");
    const quote = norm(c.quote ?? "");
    if (ctx.libraryPassages && quote) {
      const pids = c.passage_ids ?? [];
      if (!pids.length) errs.push(`${at}: a legal claim cites its passage_ids (the stored passages the quote is in)`);
      const texts: string[] = [];
      for (const pid of pids) {
        const ps = ctx.libraryPassages.get(pid);
        if (!ps) { errs.push(`${at}: cites unknown passage ${pid}`); continue; }
        if (!libs.some((s) => s.library_source_id === ps.source_id)) { errs.push(`${at}: passage ${pid} does not belong to a cited library source`); continue; }
        texts.push(norm(ps.text));
      }
      // The quote may sit in one passage, or run across consecutive passages (a page break): the cited passages joined in the order given.
      if (texts.length && !texts.some((t) => t.includes(quote)) && !texts.join(" ").includes(quote)) errs.push(`${at}: the quote does not appear verbatim in the cited passages (a legal quote is copied word for word from the official print)`);
    }
    if (ctx.librarySources) {
      for (const s of libs) {
        const rec = s.library_source_id ? ctx.librarySources.get(s.library_source_id) : undefined;
        if (!rec) continue;
        if (rec.needs_reprint) errs.push(`${at}: its source is marked NEEDS REPRINT in the Evidence Library (Leo found the print bad); no claim may use it until Leo uploads a clean print`);
        if (!rec.recheck_by) errs.push(`${at}: its source has no "recheck by" date in the Evidence Library; a statute needs one (ask Leo to set it)`);
        else if (rec.recheck_by < today) errs.push(`${at}: its source was due for re-verification by ${rec.recheck_by}; ask Leo for a fresh print`);
      }
    }
  }
  return errs;
}
