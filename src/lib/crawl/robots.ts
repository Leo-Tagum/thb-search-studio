// Crawl access rules: our own two hosts only, https only, robots.txt respected, stop on access restrictions.
export const ALLOWED_HOSTS = ["twinhomebuyer.com", "www.twinhomebuyer.com"] as const;
export const CRAWLER_UA = "THB-Studio-Crawler";
export const MIN_GAP_MS = 3000;

export function isAllowedUrl(url: string): boolean {
  try { const u = new URL(url); return u.protocol === "https:" && (ALLOWED_HOSTS as readonly string[]).includes(u.hostname.toLowerCase()); } catch { return false; }
}

/** 403, 429 and every 5xx stop the whole run. */
export const isAccessRestriction = (status: number) => status === 403 || status === 429 || status >= 500;

export type RobotsRules = { disallow: string[]; allow: string[] };

/** Rules for our user agent if the file names it, otherwise for "*". Only Allow/Disallow lines are read. */
export function parseRobots(text: string, ua = CRAWLER_UA): RobotsRules {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let cur: { agents: string[]; allow: string[]; disallow: string[] } | null = null; let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim(); if (!line) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === "user-agent") { if (!cur || !lastWasAgent) { cur = { agents: [], allow: [], disallow: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (!cur) continue;
    if (k === "disallow" && v) cur.disallow.push(v); else if (k === "allow" && v) cur.allow.push(v);
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && ua.toLowerCase().includes(a)));
  const pick = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return { disallow: pick.flatMap((g) => g.disallow), allow: pick.flatMap((g) => g.allow) };
}

const toRe = (p: string) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
/** Longest matching rule wins; Allow wins a tie. */
export function robotsAllows(rules: RobotsRules, path: string): boolean {
  let best = { len: -1, allow: true };
  for (const p of rules.disallow) if (toRe(p).test(path) && p.length > best.len) best = { len: p.length, allow: false };
  for (const p of rules.allow) if (toRe(p).test(path) && p.length >= best.len) best = { len: p.length, allow: true };
  return best.allow;
}
