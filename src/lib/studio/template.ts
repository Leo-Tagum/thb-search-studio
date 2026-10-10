// Body renderer: structured article -> thb-article HTML (body only; header, footer, nav and the review widget come from the site template).
// Fixed order: [style] answer capsule -> question H2s -> FAQ -> About Juan -> Related Guides -> Sources and References -> CTA box.
// The author box, Related Guides, Sources and CTA are composed here from approved inputs; agents never write them.
import { STYLE_BLOCK } from "./style-block";
import { parseInline } from "./inline";
import type { Block, Draft, Faq, Section } from "./schema";

export type BrandFactRow = { fact_key: string; fact_value: string; status: string };
export type Composed = {
  author: { name: string; sentence: string; homes: string; url: string };
  related: { text: string; url: string }[];
  sources: { label: string; url: string | null }[];
  cta: { heading: string; body: string; note: string; button: string; url: string };
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const il = (s: string) => parseInline(s).html;

/** Author box: approved brand facts only. No title or "founder" (ownership is PENDING JUAN) and no bio beyond these facts. */
export function composeAuthor(facts: BrandFactRow[], authorUrl: string): Composed["author"] {
  const get = (k: string, expected: string) => {
    const f = facts.find((x) => x.fact_key === k);
    if (!f || f.status !== "approved") throw new Error(`brand fact ${k} is not approved`);
    if (f.fact_value !== expected) throw new Error(`brand fact ${k} changed wording; the author box needs a review`);
    return f.fact_value;
  };
  get("experience_total", "25+ years of experience in Bay Area real estate");
  get("industry_experience", "Juan Diaz has been investing in Bay Area real estate since 2002");
  const homes = get("homes_purchased", "1,000+");
  const name = get("company_name", "Twin Home Buyer");
  return {
    name: "Juan Diaz",
    sentence: "Juan Diaz has 25+ years of experience in Bay Area real estate and has been investing since 2002.",
    homes: `${name} has purchased ${homes} homes.`,
    url: authorUrl,
  };
}

/** The CTA text is fixed. It states no price, timeframe, offer, as-is or no-cleanout promise (PENDING JUAN). */
export function composeCta(url: string): Composed["cta"] {
  return {
    heading: "Talk Through Your Options",
    body: "If you have read this far, you probably have a house, a family and a decision that does not feel simple. You can start by explaining your situation, whether or not you end up selling to us.",
    note: "Selling to Twin Home Buyer is one option in this guide. It is not always the right one.",
    button: "Talk About My Situation",
    url,
  };
}

const list = (tag: "ul" | "ol", items: string[], cls = "") => `<${tag}${cls ? ` class="${cls}"` : ""}>\n${items.map((i) => `<li>${il(i)}</li>`).join("\n")}\n</${tag}>`;

function renderBlock(b: Block): string {
  switch (b.t) {
    case "p": return `<p>${il(b.text)}</p>`;
    case "h3": return `<h3>${il(b.text)}</h3>`;
    case "ul": return list("ul", b.items);
    case "ol": return list("ol", b.items, "thb-questions");
    case "note": return `<p class="thb-note">${il(b.text)}</p>`;
    case "callout": return `<div class="thb-callout">\n${b.text ? `<p>${il(b.text)}</p>\n` : ""}${b.items?.length ? list("ul", b.items) + "\n" : ""}</div>`;
    case "table":
      return `<div class="thb-table-wrap">\n<table>\n<thead>\n<tr>${b.headers.map((h) => `<th>${il(h)}</th>`).join("")}</tr>\n</thead>\n<tbody>\n${b.rows.map((r) => `<tr>${r.map((c) => `<td>${il(c)}</td>`).join("")}</tr>`).join("\n")}\n</tbody>\n</table>\n</div>`;
  }
}
function renderSection(s: Section): string {
  return [`<h2>${il(s.h2)}</h2>`, ...(s.capsule ? [`<div class="thb-callout">\n<p>${il(s.capsule)}</p>\n</div>`] : []), ...s.blocks.map(renderBlock)].join("\n\n");
}
function renderFaq(f: Faq): string {
  return ["<h2>Frequently Asked Questions</h2>", ...f.items.map((i) => `<h3>${il(i.q)}</h3>\n<p>${il(i.a)}</p>`)].join("\n\n");
}

export function renderBody(draft: Draft, c: Composed): string {
  const sections = draft.units.filter((u): u is Section => u.kind === "section").map(renderSection);
  const faq = draft.units.filter((u): u is Faq => u.kind === "faq").map(renderFaq);
  const author = `<div class="thb-author">\n<h2>About ${esc(c.author.name)}</h2>\n<p>${esc(c.author.sentence)} ${esc(c.author.homes)} <a href="${esc(c.author.url)}">Read more from Juan</a>.</p>\n</div>`;
  const related = `<h2>Related Guides</h2>\n<ul>\n${c.related.map((r) => `<li><a href="${esc(r.url)}">${esc(r.text)}</a></li>`).join("\n")}\n</ul>`;
  const sources = `<h2>Sources and References</h2>\n<ul class="thb-sources">\n${c.sources.map((s) => `<li>${s.url ? `${esc(s.label)}, <a href="${esc(s.url)}" target="_blank" rel="noopener">source</a>` : esc(s.label)}</li>`).join("\n")}\n</ul>`;
  const cta = `<div class="thb-cta-box">\n<h2>${esc(c.cta.heading)}</h2>\n<p>${esc(c.cta.body)}</p>\n\n<p class="thb-note">${esc(c.cta.note)}</p>\n\n<div class="thb-cta">\n<a class="thb-button" href="${esc(c.cta.url)}">${esc(c.cta.button)}</a>\n</div>\n</div>`;
  return `${STYLE_BLOCK}\n\n<div class="thb-article">\n\n${[...sections, ...faq, author, related, sources, cta].join("\n\n")}\n\n</div>\n`;
}

/** Hard allowlist over the produced HTML: nothing outside the pattern's own tags and classes can appear. */
const TAGS = new Set(["div", "p", "h2", "h3", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "a", "strong"]);
const CLASSES = new Set(["thb-article", "thb-callout", "thb-note", "thb-table-wrap", "thb-questions", "thb-author", "thb-sources", "thb-cta-box", "thb-cta", "thb-button"]);
export function auditHtml(html: string): string[] {
  const errs: string[] = [];
  const body = html.replace(STYLE_BLOCK, "");
  for (const m of body.matchAll(/<\/?([a-zA-Z0-9]+)([^>]*)>/g)) {
    const tag = m[1].toLowerCase();
    if (!TAGS.has(tag)) errs.push(`tag <${tag}> is not allowed`);
    for (const c of m[2].matchAll(/class="([^"]*)"/g)) for (const cls of c[1].split(/\s+/)) if (cls && !CLASSES.has(cls)) errs.push(`class ${cls} is not in the pattern`);
    if (/\sstyle=|\son[a-z]+=|javascript:/i.test(m[2])) errs.push("inline style or event handler found");
  }
  return errs;
}
