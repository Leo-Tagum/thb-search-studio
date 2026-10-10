// Approval sync from the THB Approval Room artifact. Pure logic; the CLI (scripts/studio.mts) feeds it records read with ArtifactData.
// Nothing the artifact page's own code wrote is trusted:
//  - the hash the browser wrote is only a CLAIM; we compare it with the hash recomputed from the stored version;
//  - the time is the platform's server updatedAt (or our own read time), never the browser's decidedAt (kept as an untrusted note);
//  - identity is the platform viewer id, and only a viewer Leo has confirmed as approver/secondary can count. Everyone else is feedback.

export type ItemKind = "article" | "voice_reference";
export type Decision = "approve" | "hold" | "request_changes";
export type RoomRecord = {
  recordId: string; proposalId: string; itemKind: ItemKind; decision: Decision;
  claimedHash: string; viewerId: string; displayName?: string;
  serverUpdatedAt: string | null;       // platform time; null if the platform gave none (then our read time is used)
  browserDecidedAt?: string;            // untrusted note
  note?: string;
};
export type RegistryEntry = { role: "approver" | "secondary" | "operator" | null; status: "PENDING" | "CONFIRMED" | "REJECTED"; label?: string };
export type Registry = Map<string, RegistryEntry>;
export type ProposalItem = { itemKind: ItemKind; recomputedHash: string; currentHash: string };
export type Proposal = { id: string; createdAt: string; items: ProposalItem[]; requiresSecondary: boolean; open: boolean };

export type Classification = "APPROVAL" | "HOLD" | "CHANGES_REQUESTED" | "FEEDBACK" | "REJECTED";
export type Verdict = {
  classification: Classification; accepted: boolean; reason: string;
  recomputedHash: string | null; countedTime: string; role: RegistryEntry["role"];
  registerPending: boolean;             // first click by an unknown viewer: queue for Leo's confirmation
};

export function classifyRecord(rec: RoomRecord, proposals: Map<string, Proposal>, registry: Registry, readAt: string): Verdict {
  const countedTime = rec.serverUpdatedAt ?? readAt;          // never rec.browserDecidedAt
  const base = { countedTime, role: null as RegistryEntry["role"], registerPending: false, recomputedHash: null as string | null };
  const reject = (reason: string, recomputedHash: string | null = null): Verdict => ({ ...base, recomputedHash, classification: "REJECTED", accepted: false, reason });

  const p = proposals.get(rec.proposalId);
  if (!p) return reject("unknown proposal id");
  const item = p.items.find((i) => i.itemKind === rec.itemKind);
  if (!item) return reject(`proposal has no ${rec.itemKind} item`);
  const recomputed = item.recomputedHash;

  // Identity first: an unknown or unconfirmed viewer is feedback no matter what hash they wrote.
  const reg = registry.get(rec.viewerId);
  if (!reg) return { ...base, recomputedHash: recomputed, classification: "FEEDBACK", accepted: false, registerPending: true, reason: "first click from this account: saved as feedback and queued for Leo to confirm who this is" };
  if (reg.status !== "CONFIRMED" || !reg.role) return { ...base, recomputedHash: recomputed, role: reg.role, classification: "FEEDBACK", accepted: false, reason: `account is ${reg.status}; saved as feedback, not approval` };
  if (reg.role === "operator") return { ...base, recomputedHash: recomputed, role: "operator", classification: "FEEDBACK", accepted: false, reason: "operator (Leo) account: feedback only, never an approval" };

  // Confirmed approver or secondary: the proposal must still be open, and the version exactly the stored one and still current.
  if (!p.open) return reject("this proposal is closed or superseded (the article was edited or the proposal was decided); the decision does not apply", recomputed);
  if (rec.claimedHash !== recomputed) return reject(`hash mismatch: the record claims ${rec.claimedHash.slice(0, 12)}…, the stored version hashes to ${recomputed.slice(0, 12)}…`, recomputed);
  if (recomputed !== item.currentHash) return reject("this version has been superseded by an edit; the decision does not apply to the current version", recomputed);
  if (new Date(countedTime).getTime() < new Date(p.createdAt).getTime()) return reject("the record's server time is before the proposal existed", recomputed);

  const v = { ...base, recomputedHash: recomputed, role: reg.role };
  if (rec.decision === "approve") return { ...v, classification: "APPROVAL", accepted: true, reason: `approval by confirmed ${reg.role}${reg.label ? ` (${reg.label})` : ""}` };
  if (rec.decision === "hold") return { ...v, classification: "HOLD", accepted: true, reason: `hold by confirmed ${reg.role}` };
  return { ...v, classification: "CHANGES_REQUESTED", accepted: true, reason: `changes requested by confirmed ${reg.role}` };
}

export type Counted = { viewerId: string; role: "approver" | "secondary"; itemKind: ItemKind; classification: Classification; time: string };

/**
 * Sign-off for one proposal. The article needs an approver's approval; if the proposal carries a voice-reference item it needs
 * the approver's approval too (a hold or requested change there sends the article back to Agent 7). A privacy exception needs a
 * secondary approver who is a different account from the approver, and neither may be the operator.
 */
export function evaluateSignoff(p: Proposal, counted: Counted[]): { status: "APPROVED" | "WAITING" | "SENT_BACK"; reasons: string[] } {
  const reasons: string[] = [];
  const by = (kind: ItemKind, role: Counted["role"], cls: Classification) => counted.filter((c) => c.itemKind === kind && c.role === role && c.classification === cls);
  const voice = p.items.some((i) => i.itemKind === "voice_reference");
  if (voice && (by("voice_reference", "approver", "HOLD").length || by("voice_reference", "approver", "CHANGES_REQUESTED").length)) return { status: "SENT_BACK", reasons: ["the approver did not accept the voice reference: the article goes back to Agent 7"] };
  if (by("article", "approver", "HOLD").length || by("article", "approver", "CHANGES_REQUESTED").length) return { status: "SENT_BACK", reasons: ["the approver put the article on hold or asked for changes"] };
  const a = by("article", "approver", "APPROVAL");
  if (!a.length) reasons.push("waiting for the approver's approval of the article");
  if (voice && !by("voice_reference", "approver", "APPROVAL").length) reasons.push("waiting for the approver to confirm the voice reference");
  if (p.requiresSecondary) {
    const s = by("article", "secondary", "APPROVAL");
    if (!s.length) reasons.push("waiting for the independent secondary approval (privacy exception)");
    else if (a.length && s.every((x) => a.some((y) => y.viewerId === x.viewerId))) reasons.push("the secondary approver must be a different account from the approver");
  }
  return reasons.length ? { status: "WAITING", reasons } : { status: "APPROVED", reasons: [] };
}

/** Leo confirms who a first-click account is. Never Leo as secondary (or approver): the operator cannot sign off their own work. */
export function confirmRegistration(registry: Registry, viewerId: string, role: "approver" | "secondary" | "operator", label: string): { ok: true } | { ok: false; error: string } {
  const e = registry.get(viewerId);
  if (!e) return { ok: false, error: "unknown account: it must click in the Approval Room first" };
  if (!label.trim()) return { ok: false, error: "a label is required, e.g. Juan or Cherry" };
  if (role !== "operator" && /^leo\b/i.test(label.trim())) return { ok: false, error: "Leo is the operator and can never be an approver or the secondary" };
  if (role !== "operator" && e.role === "operator") return { ok: false, error: "this account is registered as the operator (Leo); it can never be an approver or secondary" };
  return { ok: true };
}
