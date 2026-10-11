/* eslint-disable @typescript-eslint/no-explicit-any */
// Exports an assembled article version as plain readable Markdown (body only; the header, footer, nav and review widget come from the site
// template) plus every optional finding that was left unresolved. Read-only.
// Usage: npx tsx --env-file=.env.local scripts/export-draft.mts <article_id> <out.md>
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";

const [articleId, out] = process.argv.slice(2);
if (!articleId || !out) throw new Error("usage: export-draft.mts <article_id> <out.md>");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data: art } = await db.from("articles").select("*").eq("id", articleId).single();
const { data: ver } = await db.from("article_versions").select("*").eq("id", art!.locked_version_id).single();
const { draft, composed } = ver!.body as { draft: { title: string; slug: string; units: any[] }; composed: any };

const lines: string[] = [];
const block = (b: any) => {
  switch (b.t) {
    case "p": lines.push(b.text, ""); break;
    case "h3": lines.push(`### ${b.text}`, ""); break;
    case "ul": lines.push(...b.items.map((i: string) => `- ${i}`), ""); break;
    case "ol": lines.push(...b.items.map((i: string, n: number) => `${n + 1}. ${i}`), ""); break;
    case "note": lines.push(`> Note: ${b.text}`, ""); break;
    case "callout": if (b.text) lines.push(`> ${b.text}`); for (const i of b.items ?? []) lines.push(`> - ${i}`); lines.push(""); break;
    case "table": lines.push(`| ${b.headers.join(" | ")} |`, `| ${b.headers.map(() => "---").join(" | ")} |`, ...b.rows.map((r: string[]) => `| ${r.join(" | ")} |`), ""); break;
  }
};

lines.push(`# ${draft.title}`, "", `Draft export. Version \`${art!.version_hash}\` (article ${articleId}), state ${art!.state}. Body only: the site template supplies the header, footer, navigation and review widget.`, `Planned URL: /${draft.slug}/`, "", "---", "");
for (const u of draft.units) {
  if (u.kind === "section") {
    lines.push(`## ${u.h2}`, "");
    if (u.capsule) lines.push(`> **Answer capsule:** ${u.capsule}`, "");
    u.blocks.forEach(block);
  } else {
    lines.push("## Frequently Asked Questions", "");
    for (const i of u.items) lines.push(`### ${i.q}`, "", i.a, "");
  }
}
lines.push("## About Juan Diaz", "", `${composed.author.sentence} ${composed.author.homes} [Read more from Juan](${composed.author.url}).`, "");
lines.push("## Related Guides", "", ...composed.related.map((r: any) => `- [${r.text}](${r.url})`), "");
lines.push("## Sources and References", "", ...composed.sources.map((s: any) => `- ${s.label}${s.url ? ` ([source](${s.url}))` : ""}`), "");
lines.push(`## ${composed.cta.heading}`, "", composed.cta.body, "", `> ${composed.cta.note}`, "", `**Button:** [${composed.cta.button}](${composed.cta.url})`, "");

// Unresolved optional findings: the latest review by each agent on each section, with the version it reviewed.
const { data: secs } = await db.from("article_sections").select("id,section_key,position,locked_version_id").eq("article_id", articleId).order("position");
const { data: revs } = await db.from("section_reviews").select("section_id,version_id,agent_key,decision,findings,advisory_score,created_at").in("section_id", secs!.map((s) => s.id)).order("created_at");
const { data: vs } = await db.from("section_versions").select("id,version_no").in("section_id", secs!.map((s) => s.id));
const vno = new Map((vs ?? []).map((v) => [v.id, v.version_no]));
const AG: Record<string, string> = { "thb-05-fact-privacy-auditor": "Agent 5 (fact/privacy)", "thb-06-seo-aeo-geo-auditor": "Agent 6 (SEO/AEO/GEO)", "thb-07-editorial-critic": "Agent 7 (editorial)" };
lines.push("---", "", "# Unresolved optional findings", "", "Optional findings never block and none has been applied. Each is from the agent's latest review of that section; the version number shows which version it reviewed (the locked version is marked).", "");
let total = 0;
for (const s of secs!) {
  const latest = new Map<string, any>();
  for (const r of revs!.filter((x) => x.section_id === s.id)) latest.set(r.agent_key, r);
  const items: string[] = [];
  for (const [agent, r] of latest) {
    const opt = (r.findings as any[]).filter((f) => f.severity === "optional");
    for (const f of opt) { items.push(`- ${AG[agent]}, reviewed v${vno.get(r.version_id)}${r.version_id === s.locked_version_id ? " (locked version)" : " (an earlier version)"}: ${f.note}`); total++; }
    if (agent === "thb-07-editorial-critic" && r.advisory_score != null) items.push(`- Agent 7 advisory score: ${r.advisory_score}${r.advisory_score < 85 ? " (under 85: revise recommended; advisory only)" : ""}`);
  }
  const label = s.section_key === "faq" ? "FAQ" : s.section_key;
  const heading = s.section_key === "faq" ? "Frequently Asked Questions" : draft.units.find((u) => u.key === s.section_key)?.h2;
  lines.push(`## ${label}: ${heading}`, "", ...(items.length ? items : ["- none"]), "");
}
lines.push(`Total optional findings: ${total}.`, "");

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n"));
console.log(`wrote ${out}: ${lines.length} lines, ${total} optional findings, version ${art!.version_hash!.slice(0, 12)}`);
