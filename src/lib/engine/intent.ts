// Query -> intent key + place scope. Deterministic and explainable; never an embedding/similarity score.
const CITIES = [
  "san francisco", "oakland", "san jose", "san mateo", "concord", "sunnyvale", "santa rosa", "huntington park", "fremont", "hayward",
  "berkeley", "alameda", "antioch", "pittsburg", "walnut creek", "richmond", "vallejo", "fairfield", "vacaville", "napa", "novato",
  "san rafael", "petaluma", "rohnert park", "daly city", "south san francisco", "redwood city", "burlingame", "palo alto", "mountain view",
  "santa clara", "milpitas", "cupertino", "campbell", "los gatos", "los altos", "santa cruz", "livermore", "pleasanton", "dublin",
  "san leandro", "union city", "newark", "emeryville", "piedmont", "san ramon", "danville", "martinez", "brentwood", "dixon", "oakley",
  "hercules", "pinole", "el cerrito", "albany", "orinda", "lafayette", "moraga", "castro valley", "san bruno", "pacifica", "millbrae",
  "foster city", "belmont", "san carlos", "menlo park", "east palo alto", "half moon bay", "morgan hill", "gilroy", "salinas", "stockton",
  "sacramento", "modesto", "tracy", "manteca", "sonoma", "healdsburg", "mill valley", "sausalito", "tiburon", "larkspur", "cotati",
  "benicia", "suisun city", "elk grove", "los angeles", "san diego", "fresno", "bakersfield", "long beach", "anaheim", "riverside",
  "san mateo county", "alameda county", "contra costa county", "santa clara county", "marin county", "sonoma county", "napa county",
  "east bay", "south bay", "north bay", "peninsula", "bay area", "california", "northern california",
];
const PLACES = [...CITIES].sort((a, b) => b.length - a.length);
const STOP = new Set(["in", "a", "the", "to", "my", "for", "of", "and", "ca", "near", "me", "you", "your", "i", "we", "can", "do", "how", "is", "it", "on", "with", "an"]);

export type Intent = { key: string; places: string[]; scopeKey: string; tokens: string[] };

function stem(t: string): string {
  if (t === "homes" || t === "home") return "house";
  if (t === "houses") return "house";
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

export function parseQuery(q: string): Intent {
  let s = ` ${q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()} `;
  const places: string[] = [];
  for (const p of PLACES) {
    if (s.includes(` ${p} `)) { places.push(p); s = s.replace(` ${p} `, " "); }
  }
  const tokens = [...new Set(s.split(" ").filter((t) => t && !STOP.has(t)).map(stem))].sort();
  places.sort();
  return { key: tokens.join(" "), places, scopeKey: places.join("+") || "none", tokens };
}

/** Navigational/brand queries are about THB itself, not a content opportunity. */
export function isBrandQuery(q: string): boolean {
  return /twin\s?home\s?buyer|twinhomebuyer|twin home buy/i.test(q);
}

const RELEVANT = /(sell|selling|house|home|property|cash|buyer|buy|probate|inherit|foreclos|hoard|retrofit|seismic|earthquake|condemn|relocat|tenant|repair|as is|as-is|divorce|mortgage|realtor|agent|escrow|disclosure|title|lien|tax|adu|permit)/;
/** Weak hint only. The agent makes the real relevance call. */
export function sellerRelevanceHint(tokens: string[], raw: string): boolean {
  return RELEVANT.test(raw.toLowerCase()) && !/\d{2,}/.test(tokens.join(" ").replace(/\b\d{4}\b/g, ""));
}
