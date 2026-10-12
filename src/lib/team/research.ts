// Phase 3c: submit-time checks for the research roles, enforced in code (the agent files only ask; this rejects).
// R1 may cite only official sources (the same allowlist Agent 2 uses, from official-sources.ts) and may state a legal rule only with a word-for-word quote.
// The bridge extension (task 9) calls r1SubmitErrors on every R1 output before it is accepted.
import { officialUrl } from "../agents/official-sources";

type Src = { id?: string; kind?: string; url?: string | null };
type Claim = { id?: string; support?: string; risk?: string; quote?: string | null; passage_ids?: string[]; source_ids?: string[] };
export type ResearchOutput = { result?: { sources?: Src[]; claims?: Claim[] } };

const QUOTE_MAX = 400;

/** Every problem that makes an R1 output unacceptable. Empty means it may proceed to the ledger checks. */
export function r1SubmitErrors(out: ResearchOutput): string[] {
  const errs: string[] = [];
  const sources = out.result?.sources ?? [];
  const claims = out.result?.claims ?? [];
  for (const s of sources) {
    if (s.kind !== "official_url" && s.kind !== "library") { errs.push(`source ${s.id}: kind "${s.kind}" is not allowed for R1 (official_url or library only)`); continue; }
    if (s.kind === "official_url") {
      const v = s.url ? officialUrl(s.url) : { ok: false, reason: "official_url source has no url" };
      if (!v.ok) errs.push(`source ${s.id}: ${v.reason}`);
    }
  }
  const byId = new Map(sources.map((s) => [s.id, s]));
  for (const c of claims) {
    if (c.support !== "supported") continue;
    // A legal rule (high-risk claim) is stated only with a word-for-word quote. Verbatim-ness against library passages is checked by the ledger checks.
    if ((c.risk === "high" || c.risk === "critical") && !(c.quote ?? "").trim()) errs.push(`claim ${c.id}: a legal rule needs a word-for-word quote`);
    if ((c.quote ?? "").length > QUOTE_MAX) errs.push(`claim ${c.id}: quote is longer than ${QUOTE_MAX} characters`);
    // A supported claim cannot rest on a source outside the allowlist, even if that source slipped into the list.
    for (const sid of c.source_ids ?? []) {
      const s = byId.get(sid);
      if (s?.kind === "official_url" && s.url && !officialUrl(s.url).ok) errs.push(`claim ${c.id} rests on non-official source ${sid}`);
    }
  }
  return errs;
}
