// Phase 3c task 12: how Research output reaches the claim ledger. Research adds claims only through R1/R3 packs that already passed the same ledger
// checks Agent 2 passes; here the new claims get fresh keys (they must never overwrite an existing clm:N) and become rows shaped like the ones
// the brief approval creates. Only supported claims enter the ledger; the rest are reported back to the requester as "cannot prove".
export type PackClaim = { id: string; text: string; source_ids: string[]; support: string; jurisdiction: string; risk: string; quote?: string; passage_ids?: string[]; note?: string };
export type PackSource = { id: string; kind: string; url?: string; library_source_id?: string; effective_date: string | null };

/** Fresh keys for new claims: clm:<max existing + 1>, +2 ... in the order given. Returns old id -> new key. */
export function remapClaimKeys(existingKeys: Iterable<string>, claims: { id: string }[]): Map<string, string> {
  let max = 0;
  for (const k of existingKeys) { const m = /^clm:(\d+)$/.exec(k); if (m) max = Math.max(max, Number(m[1])); }
  return new Map(claims.map((c, i) => [c.id, `clm:${max + i + 1}`]));
}

export function supportedClaims(claims: PackClaim[]) { return claims.filter((c) => c.support === "supported"); }

/** A claims-table row for a supported claim from a Research pack. sourceDbId: the evidence_sources id of its first source (a library source or a stored page snapshot). */
export function claimRow(articleId: string, key: string, c: PackClaim, sourceDbId: string | null, effectiveDate: string | null, declaredBy: string, today: string, textHash: string) {
  return {
    article_id: articleId, claim_key: key, claim_text: c.text, claim_type: "statute", risk_level: c.risk, source_id: sourceDbId, supporting_passage: c.quote ?? null, jurisdiction: c.jurisdiction,
    applicability: "California residential sale", effective_or_verified_date: effectiveDate, checked_date: today, confidence_status: c.support, publication_permission: "public_law", requires_human_review: false,
    support: c.support, declared_by: declaredBy, text_hash: textHash,
  };
}

/** The message Research leaves on the ticket: what was added (with the new keys) and what could not be proven. */
export function packSummary(role: string, added: { key: string; text: string }[], notProven: string[], extra = ""): string {
  const parts = [`${role} answer.`];
  parts.push(added.length ? `Added to the ledger: ${added.map((a) => `${a.key} "${a.text}"`).join("; ")}.` : "No claim was added to the ledger.");
  if (notProven.length) parts.push(`Could not prove: ${notProven.join("; ")}.`);
  if (extra) parts.push(extra);
  return parts.join(" ");
}
