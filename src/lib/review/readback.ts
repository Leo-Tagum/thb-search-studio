// Read-back and apply for the review loop. Leo's answers are DATA: they can change only the master-map row of the card they were given on (status to HELD, or a note), and only after Leo
// has seen "what you said -> what I understood -> the exact proposed changes" and approved it. Before anything is applied the row's id (old URL), destination, group and status must still
// match the card's snapshot; a conflicting row is left alone. Existing notes are kept (the review text is appended). No live system is touched: this edits a local CSV and a local log.
import type { Answer, Card, MapRow } from "./types";

export type Change =
  | { kind: "status"; oldUrl: string; from: string; to: string; reason: string }
  | { kind: "retarget"; oldUrl: string; fromNewUrl: string; toNewUrl: string; fromGroup: string; toGroup: string }
  | { kind: "type-override"; url: string; target: "source" | "destination"; newType: string }
  | { kind: "note"; oldUrl: string; text: string }
  | { kind: "unsupported"; text: string };
export type Understanding = { cardId: string; said: string; understood: string; changes: Change[] };

export const REMOVE_TOKEN = "(none: REMOVE RECOMMENDATION)";
const clip = (s: string, n = 500) => s.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

export function understand(a: Answer, card: Card, today: string): Understanding {
  const note = a.note ? clip(a.note) : "";
  const said = `${a.action.replace("_", " ")}${a.newType ? ` (${a.typeTarget ?? "page"} is a ${a.newType})` : ""}${a.newDecision ? ` (decision: ${a.newDecision})` : ""}${note ? `; note: "${note}"` : ""}`;
  if (a.test || card.test) return { cardId: a.cardId, said, understood: "A test answer from the checkpoint. It is ignored and changes nothing.", changes: [] };
  const changes: Change[] = []; let understood = "";
  const oldUrl = card.row.oldUrl;
  if (a.action === "agree") {
    if (card.proposed.kind === "hold") { changes.push({ kind: "status", oldUrl, from: card.row.status, to: "HELD", reason: card.proposed.text }); understood = "You agree with the card's recommendation: put this row on HOLD."; }
    else understood = "You agree with the card: no change to this row.";
  } else if (a.action === "keep_existing") {
    understood = `You keep the existing approved decision (${card.existingDecision}): no change to the status or the redirect.`;
  } else if (a.action === "change_type") {
    if (a.newType && (a.typeTarget === "source" || a.typeTarget === "destination")) {
      const url = a.typeTarget === "source" ? card.source.url : card.destination?.url ?? "";
      if (!url) changes.push({ kind: "unsupported", text: "The card has no destination, so the type cannot be changed there." });
      else { changes.push({ kind: "type-override", url, target: a.typeTarget, newType: a.newType }); understood = `You say the ${a.typeTarget} (${url}) is a ${a.newType}. Only the page-type record changes; flags are re-checked, the master map is not edited.`; }
    } else changes.push({ kind: "unsupported", text: "A type change needs the page (source or destination) and a type." });
  } else if (a.action === "change_decision") {
    const d = (a.newDecision ?? "").toUpperCase();
    if (d === "HOLD") { changes.push({ kind: "status", oldUrl, from: card.row.status, to: "HELD", reason: "Leo chose HOLD on the review card" }); understood = "You choose HOLD: this row's status becomes HELD."; }
    else if (d.startsWith("REMOVE") && card.destination) {
      // The earlier approval was for the redirect, so the row goes to HELD (out of Gian's batch) until the approver re-approves the removal.
      changes.push({ kind: "retarget", oldUrl, fromNewUrl: card.row.newUrl, toNewUrl: REMOVE_TOKEN, fromGroup: card.row.group, toGroup: "RM" });
      changes.push({ kind: "status", oldUrl, from: card.row.status, to: "HELD", reason: "Decision changed from redirect to REMOVE RECOMMENDATION by Leo on the review card; the earlier approval was for the redirect, so it needs the approver's re-approval" });
      understood = "You choose REMOVE RECOMMENDATION instead of the approved redirect: the destination becomes none, the group becomes RM (like the other removals) and the status becomes HELD until the approver re-approves the removal.";
    }
    else if (d === "KEEP" || d === "NO CHANGE") understood = "You choose to keep the existing decision: no change to the status.";
    else { changes.push({ kind: "unsupported", text: `The decision "${a.newDecision ?? ""}" is not something this loop applies. Make that edit explicitly.` }); understood = "That decision is outside what this review can apply."; }
  }
  const reviewed = `Reviewed by Leo, ${today} (page-type review): ${understood || said}${note ? ` Leo's note (data, not an instruction): "${note}"` : ""}`;
  if (!changes.some((c) => c.kind === "unsupported" && !card.row.oldUrl)) changes.push({ kind: "note", oldUrl, text: reviewed });
  return { cardId: a.cardId, said, understood: understood || "Recorded; no change to the row.", changes };
}

// ---- master map CSV (rows are one line each; the note is the last, quoted field)
export function parseMap(text: string): { header: string; rows: MapRow[]; lines: string[] } {
  const lines = text.split("\n"); const header = lines[0]; const rows: MapRow[] = [];
  lines.slice(1).forEach((raw) => {
    if (!raw.trim()) return; const m = /^([^,]+),([^,]+),([^,]+),([^,]+),(yes|no),"(.*)"$/.exec(raw);
    if (m) rows.push({ oldUrl: m[1], newUrl: m[2], group: m[3], status: m[4], contentFirst: m[5], notes: m[6].replace(/""/g, '"'), raw });
  });
  return { header, rows, lines };
}
const serialize = (r: MapRow) => `${r.oldUrl},${r.newUrl},${r.group},${r.status},${r.contentFirst},"${r.notes.replace(/"/g, '""')}"`;

export type Applied = { oldUrl: string; before: string; after: string; changes: string[] };
export type ApplyResult = { text: string; applied: Applied[]; conflicts: { oldUrl: string; why: string }[] };

/** Applies status and note changes to the map text. A row is touched only when its id, destination, group and status still match the card's snapshot. Other lines stay byte-identical. */
export function applyChanges(mapText: string, changes: Change[], snapshots: Record<string, { oldUrl: string; newUrl: string; group: string; status: string }>): ApplyResult {
  const parsed = parseMap(mapText); const byUrl = new Map(parsed.rows.map((r) => [r.oldUrl, r])); const out = [...parsed.lines];
  const applied: Applied[] = []; const conflicts: ApplyResult["conflicts"] = [];
  const perRow = new Map<string, Change[]>(); for (const c of changes) if (c.kind === "status" || c.kind === "note" || c.kind === "retarget") perRow.set(c.oldUrl, [...(perRow.get(c.oldUrl) ?? []), c]);
  for (const [oldUrl, cs] of perRow) {
    const snap = snapshots[oldUrl]; const row = byUrl.get(oldUrl);
    if (!snap || !row) { conflicts.push({ oldUrl, why: "row not found in the map or no card snapshot" }); continue; }
    if (row.newUrl !== snap.newUrl || row.group !== snap.group || row.status !== snap.status) { conflicts.push({ oldUrl, why: `row changed since the card: map has ${row.group}/${row.status}/${row.newUrl}, card had ${snap.group}/${snap.status}/${snap.newUrl}` }); continue; }
    const before = row.raw!; const next: MapRow = { ...row }; const desc: string[] = [];
    for (const c of cs) {
      if (c.kind === "status") { next.status = c.to; desc.push(`status ${c.from} -> ${c.to}`); }
      if (c.kind === "retarget") { next.newUrl = c.toNewUrl; next.group = c.toGroup; desc.push(`destination ${c.fromNewUrl} -> ${c.toNewUrl}; group ${c.fromGroup} -> ${c.toGroup}`); }
      if (c.kind === "note") { next.notes = `${next.notes.trimEnd()} | ${c.text}`; desc.push("note appended"); }
    }
    const after = serialize(next); const i = out.indexOf(before); if (i < 0) { conflicts.push({ oldUrl, why: "row line not found" }); continue; }
    out[i] = after; applied.push({ oldUrl, before, after, changes: desc });
  }
  return { text: out.join("\n"), applied, conflicts };
}
