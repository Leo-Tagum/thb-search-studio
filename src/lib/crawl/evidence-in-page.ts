// In-page scripts for evidence capture. Plain JS strings (a TypeScript transpiler must not inject helpers into code that runs inside the page). They only READ the page and paint
// privacy redactions into the rendered copy that is about to be screenshotted: nothing is clicked, typed or submitted, and nothing is sent anywhere.
//  REDACT_JS(opts): blacks out testimonial/reviewer cards, text matching the seller-identifying patterns, and images whose filename or alt text looks like an address. Returns the
//    rectangles it blacked out (page coordinates) and how many matches remain visible afterwards (must be 0).
//  FEATURES_JS(): measures what a visitor sees at the top of the page (offer form, offer button, byline, date) for the page-type rules.
export const REDACT_JS = String.raw`(opts) => {
  const P = opts.patterns; const R = (s, f) => new RegExp(s, f);
  const allowed = P.allowed.map((a) => R(a, "gi")); const strip = (t) => allowed.reduce((x, r) => x.replace(r, " "), t);
  const rev = R(P.reviewer); const addr = [P.streetAddress, P.streetStory, P.email, P.phone, P.zip].map((s) => R(s));
  const hit = (t) => { t = strip(t); return addr.some((r) => r.test(t)); };
  const words = (el) => (el.textContent || "").trim().split(/\s+/).filter(Boolean).length;
  const marked = new Map();
  const climb = (el, maxWords, maxH) => { let cur = el; while (cur.parentElement && cur.parentElement !== document.body && cur.parentElement !== document.documentElement) { const p = cur.parentElement; if (words(p) > maxWords || p.getBoundingClientRect().height > maxH) break; cur = p; } return cur; };
  const mark = (el, kind) => { if (el && el !== document.body && el !== document.documentElement && !marked.has(el)) marked.set(el, kind); };
  const SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, HEAD: 1, TEMPLATE: 1 };
  const leaves = Array.from(document.body.querySelectorAll("*")).filter((e) => !SKIP[e.tagName] && e.children.length === 0 && (e.textContent || "").trim());
  for (const el of leaves) { const t = (el.textContent || "").trim(); if (rev.test(t)) mark(climb(el, 120, 900), "reviewer"); else if (hit(t)) mark(climb(el, 80, 600), "text-pattern"); }
  const fileLike = /(?:^|[\/_-])\d{2,5}[-_ ][a-z]+[-_ ](?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|way|blvd)(?:[-_.]|$)/i;
  for (const img of Array.from(document.images)) { const name = ((img.currentSrc || img.src || "").split("?")[0].split("/").pop() || "") + " " + (img.alt || ""); if (fileLike.test(name) || hit(img.alt || "")) mark(img, "image"); }
  const css = ".thb-redact, .thb-redact * { background: #000 !important; background-image: none !important; color: #000 !important; border-color: #000 !important; text-shadow: none !important; box-shadow: none !important; outline-color: #000 !important; } .thb-redact img, .thb-redact svg, .thb-redact picture, .thb-redact video, img.thb-redact { filter: brightness(0) !important; }";
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  // Inline !important beats any stylesheet rule, including the site's own !important rules; pseudo-elements get a rule of their own.
  const paint = (e) => { const s = e.style; s.setProperty("background", "#000", "important"); s.setProperty("background-image", "none", "important"); s.setProperty("color", "#000", "important"); s.setProperty("-webkit-text-fill-color", "#000", "important"); s.setProperty("border-color", "#000", "important"); s.setProperty("text-shadow", "none", "important"); s.setProperty("box-shadow", "none", "important"); s.setProperty("outline-color", "#000", "important"); if (/^(IMG|SVG|PICTURE|VIDEO|CANVAS)$/i.test(e.tagName)) { s.setProperty("filter", "brightness(0)", "important"); s.setProperty("opacity", "1", "important"); } };
  const st2 = document.createElement("style"); st2.textContent = ".thb-redact::before, .thb-redact::after, .thb-redact *::before, .thb-redact *::after { background: #000 !important; background-image: none !important; color: #000 !important; border-color: #000 !important; box-shadow: none !important; text-shadow: none !important; }"; document.head.appendChild(st2);
  for (const el of marked.keys()) { el.classList.add("thb-redact"); paint(el); for (const k of Array.from(el.querySelectorAll("*"))) paint(k); }
  const top = Array.from(marked.entries()).filter(([el]) => { let p = el.parentElement; while (p) { if (marked.has(p)) return false; p = p.parentElement; } return true; });
  // The recorded box is only the part that is actually drawn: a card inside a sideways carousel is clipped by an ancestor with overflow hidden, so intersect with every clipping ancestor.
  const visible = (el) => { const r = el.getBoundingClientRect(); let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom; for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.overflowX !== "visible" || cs.overflowY !== "visible") { const q = p.getBoundingClientRect(); if (cs.overflowX !== "visible") { x0 = Math.max(x0, q.left); x1 = Math.min(x1, q.right); } if (cs.overflowY !== "visible") { y0 = Math.max(y0, q.top); y1 = Math.min(y1, q.bottom); } } } return { x: x0 + window.scrollX, y: y0 + window.scrollY, w: x1 - x0, h: y1 - y0 }; };
  const rects = top.map(([el, kind]) => Object.assign(visible(el), { kind })).filter((r) => r.w > 1 && r.h > 1);
  let remaining = 0;
  for (const el of leaves) { if (el.closest(".thb-redact")) continue; const t = (el.textContent || "").trim(); if (rev.test(t) || hit(t)) remaining++; }
  for (const img of Array.from(document.images)) { if (img.closest(".thb-redact") || img.classList.contains("thb-redact")) continue; const name = ((img.currentSrc || img.src || "").split("?")[0].split("/").pop() || "") + " " + (img.alt || ""); if (fileLike.test(name)) remaining++; }
  return { rects, counts: top.reduce((m, [, k]) => { m[k] = (m[k] || 0) + 1; return m; }, {}), remaining, pageHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) };
}`;

export const FEATURES_JS = String.raw`() => {
  const y = (el) => el.getBoundingClientRect().top + window.scrollY;
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inChrome = (e) => !!e.closest("header, nav, footer");
  const forms = Array.from(document.querySelectorAll("form")).filter((f) => vis(f) && !inChrome(f) && f.querySelectorAll("input:not([type=hidden]), select, textarea").length >= 2);
  const OFFER = /offer|sell (my|your)|get (my|a|your)|call (us|now)|contact/i;
  const ctas = Array.from(document.querySelectorAll("a, button")).filter((e) => vis(e) && !inChrome(e) && OFFER.test(e.textContent || "") && (e.tagName === "BUTTON" || /button|btn|cta/i.test(e.className || "")));
  const main = document.querySelector("main") || document.body; const txt = (main.innerText || "").slice(0, 3000);
  const ld = Array.from(document.querySelectorAll("script[type='application/ld+json']")).map((s) => s.textContent || "").join(" ");
  const fold = window.innerHeight || 900;
  return {
    h1: ((document.querySelector("h1") || {}).textContent || "").replace(/\s+/g, " ").trim(), title: document.title,
    firstFormY: forms.length ? Math.min(...forms.map(y)) : null, firstCtaY: ctas.length ? Math.min(...ctas.map(y)) : null,
    ctaCount: ctas.length, ctaCountAfterFold: ctas.filter((c) => y(c) > fold).length,
    hasByline: !!document.querySelector("[rel=author], .author, .byline, [class*=author]") || /(^|\n)\s*By [A-Z][a-z]+/.test(txt),
    hasDate: !!document.querySelector("time") || /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d\d\b/.test(txt),
    hasArticleSchema: /"@type"\s*:\s*"?(Article|BlogPosting|NewsArticle)/.test(ld), hasLocalBusinessSchema: /LocalBusiness/.test(ld),
    navLinks: document.querySelectorAll("header a, nav a").length, words: (main.innerText || "").split(/\s+/).filter(Boolean).length
  };
}`;
