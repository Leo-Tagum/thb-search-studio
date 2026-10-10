// Manual action list for approved MERGE / RETIRE / NOINDEX verdicts. The Studio only LISTS; Leo and Gian execute in WordPress.
// Pure helpers: validation (no chains, loops, self-redirects, missing/retired targets) and CSV export.
import { normalizeUrl } from "../engine/match";

export type ActionRow = { action: "MERGE" | "RETIRE" | "NOINDEX"; old_url: string; target_url: string | null; reason: string; evidence_summary: string; status?: string };

/** `inventory` = URLs of existing inventory posts/pages a redirect may point at. Returns human-readable problems (empty = OK). */
export function validateActions(actions: ActionRow[], inventory: Set<string>): string[] {
  const problems: string[] = [];
  const inv = new Set([...inventory].map(normalizeUrl));
  const byOld = new Map(actions.map((a) => [normalizeUrl(a.old_url), a]));
  for (const a of actions) {
    if (a.action === "NOINDEX") { if (a.target_url) problems.push(`${a.old_url}: NOINDEX must not have a target`); continue; }
    if (!a.target_url) { problems.push(`${a.old_url}: ${a.action} has no target URL`); continue; }
    const t = normalizeUrl(a.target_url);
    if (t === normalizeUrl(a.old_url)) problems.push(`${a.old_url}: redirects to itself`);
    else if (!inv.has(t)) problems.push(`${a.old_url}: target ${a.target_url} is not an existing inventory URL`);
    else {
      const next = byOld.get(t);
      if (next) problems.push(`${a.old_url}: target ${a.target_url} is itself being ${next.action === "NOINDEX" ? "noindexed" : "retired/merged away"} (chain or loop)`);
    }
  }
  return problems;
}

const esc = (v: string | null) => `"${(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
export function actionsToCsv(actions: ActionRow[]): string {
  const head = ["action", "old_url", "target_url", "http_redirect", "reason", "evidence_summary", "status"];
  const rows = actions.map((a) => [a.action, a.old_url, a.target_url, a.action === "NOINDEX" ? "" : "301", a.reason, a.evidence_summary, a.status ?? "TO_DO"].map((v) => esc(v as string | null)).join(","));
  return [head.join(","), ...rows].join("\r\n") + "\r\n";
}
