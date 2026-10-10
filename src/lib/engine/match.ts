// Page <-> GSC URL matching. GSC reports URLs as served; inventory holds de-duplicated canonicals.
export function normalizeUrl(u: string): string {
  try {
    const x = new URL(u);
    const host = x.hostname.toLowerCase().replace(/^www\./, "");
    const path = x.pathname.replace(/\/+$/, "") || "/";
    return `${host}${decodeURI(path)}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

export function matchPages(gscUrls: string[], pages: { id: string; url: string; canonical_url: string }[]) {
  const index = new Map<string, string>();
  for (const p of pages) { index.set(normalizeUrl(p.canonical_url), p.id); index.set(normalizeUrl(p.url), p.id); }
  const map = new Map<string, string>();
  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const u of new Set(gscUrls)) {
    const id = index.get(normalizeUrl(u));
    if (id) { map.set(u, id); matched.push(u); } else unmatched.push(u); // kept and listed, never dropped
  }
  return { map, matched, unmatched };
}
