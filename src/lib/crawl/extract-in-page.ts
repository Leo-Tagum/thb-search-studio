// The extractor that runs INSIDE the browser page (read only: it only reads the DOM, it never clicks, types or submits).
// It is kept as a plain JS string so a TypeScript transpiler cannot inject helpers that do not exist in the page.
// Used twice: on the rendered document, and on the raw HTML parsed inertly with DOMParser (no scripts run, no requests are made).
// Usage: page.evaluate(`(${EXTRACT_JS})(${JSON.stringify({ html, base })})`) ; html omitted = use the live document.
export const EXTRACT_JS = String.raw`(opts) => {
  const doc = typeof opts.html === "string" ? new DOMParser().parseFromString(opts.html, "text/html") : document;
  const base = opts.base;
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const abs = (h) => { try { return new URL(h, base).href; } catch (e) { return h; } };
  const metaContent = (sel) => { const e = doc.querySelector(sel); return e ? clean(e.getAttribute("content")) : null; };
  const SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, NAV: 1, HEADER: 1, FOOTER: 1, ASIDE: 1, FORM: 1, TEMPLATE: 1, SVG: 1, IFRAME: 1 };
  const INLINE = { A: 1, SPAN: 1, B: 1, I: 1, EM: 1, STRONG: 1, BR: 1, SMALL: 1, U: 1, SUP: 1, SUB: 1, MARK: 1, LABEL: 1, BUTTON: 1, IMG: 1, ABBR: 1, S: 1, FONT: 1 };
  const candidates = ["main", "article", ".entry-content", "[data-elementor-type='wp-page']", "[data-elementor-type='wp-post']", "#content", "body"];
  let root = null, rootSelector = "body";
  for (const sel of candidates) { const e = doc.querySelector(sel); if (e && clean(e.textContent).length > 200) { root = e; rootSelector = sel; break; } }
  if (!root) { root = doc.body || doc.documentElement; rootSelector = "body"; }
  const blocks = [];
  const push = (b) => { const last = blocks[blocks.length - 1]; if (last && last.t === b.t && last.text === b.text) return; blocks.push(b); };
  const walk = (el) => {
    for (const c of Array.from(el.children)) {
      const tag = c.tagName.toUpperCase();
      if (SKIP[tag]) continue;
      if (/^H[1-6]$/.test(tag)) { const t = clean(c.textContent); if (t) push({ t: "h", level: Number(tag[1]), text: t }); continue; }
      if (tag === "P" || tag === "BLOCKQUOTE") { const t = clean(c.textContent); if (t) push({ t: "p", text: t }); continue; }
      if (tag === "LI") { const t = clean(c.textContent); if (t) push({ t: "li", text: t }); continue; }
      if (tag === "TABLE") { const rows = Array.from(c.querySelectorAll("tr")).map((r) => Array.from(r.children).filter((x) => /^(TD|TH)$/i.test(x.tagName)).map((x) => clean(x.textContent))).filter((r) => r.length); if (rows.length) blocks.push({ t: "table", rows: rows }); continue; }
      const hasBlockChild = Array.from(c.children).some((x) => !INLINE[x.tagName.toUpperCase()]);
      if (!hasBlockChild) { const t = clean(c.textContent); if (t && t.length > 1) push({ t: "p", text: t }); continue; }
      walk(c);
    }
  };
  walk(root);
  const headings = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) => ({ level: Number(h.tagName[1]), text: clean(h.textContent) })).filter((h) => h.text);
  const links = Array.from(doc.querySelectorAll("a[href]")).map((a) => ({ href: abs(a.getAttribute("href")), text: clean(a.textContent) || clean(a.getAttribute("aria-label")), inMain: root.contains(a) })).filter((l) => !/^javascript:/i.test(l.href));
  const images = Array.from(doc.querySelectorAll("img")).map((i) => ({ src: abs(i.getAttribute("src") || i.getAttribute("data-src") || ""), alt: i.hasAttribute("alt") ? i.getAttribute("alt") : null }));
  const forms = Array.from(doc.querySelectorAll("form")).map((f) => ({ action: abs(f.getAttribute("action") || ""), method: (f.getAttribute("method") || "get").toLowerCase(), fields: f.querySelectorAll("input:not([type=hidden]),select,textarea").length }));
  const ctas = Array.from(doc.querySelectorAll("a,button")).filter((e) => /button|btn|cta/i.test(e.getAttribute("class") || "") || e.getAttribute("role") === "button" || /^tel:/i.test(e.getAttribute("href") || "")).map((e) => ({ text: clean(e.textContent), href: e.getAttribute("href") ? abs(e.getAttribute("href")) : null })).filter((c) => c.text || c.href);
  const og = {}; doc.querySelectorAll("meta[property^='og:']").forEach((m) => { og[m.getAttribute("property")] = clean(m.getAttribute("content")); });
  return {
    title: clean(doc.title),
    metaDescription: metaContent("meta[name='description']"),
    canonical: (doc.querySelector("link[rel='canonical']") || { getAttribute: () => null }).getAttribute("href"),
    metaRobots: metaContent("meta[name='robots']"),
    hreflang: Array.from(doc.querySelectorAll("link[rel='alternate'][hreflang]")).map((l) => ({ lang: l.getAttribute("hreflang"), href: l.getAttribute("href") })),
    og: og,
    jsonLdRaw: Array.from(doc.querySelectorAll("script[type='application/ld+json']")).map((s) => s.textContent || ""),
    h1s: Array.from(doc.querySelectorAll("h1")).map((h) => clean(h.textContent)).filter(Boolean),
    headings: headings, blocks: blocks, links: links, images: images, forms: forms, ctas: ctas, rootSelector: rootSelector
  };
}`;
