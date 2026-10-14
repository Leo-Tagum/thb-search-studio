// Types for the page crawler and the comparison engine. Everything here is plain data (JSON-safe) so it can be stored and tested without a browser.

export type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "li"; text: string }
  | { t: "table"; rows: string[][] };

export type LinkInfo = { href: string; text: string; inMain: boolean };
export type ImageInfo = { src: string; alt: string | null };
export type FormInfo = { action: string; method: string; fields: number };
export type CtaInfo = { text: string; href: string | null };

/** What the in-page extractor returns for one document (the rendered DOM, or the raw HTML parsed inertly). */
export type DocExtract = {
  title: string;
  metaDescription: string | null;
  canonical: string | null;
  metaRobots: string | null;
  hreflang: { lang: string; href: string }[];
  og: Record<string, string>;
  jsonLdRaw: string[];
  h1s: string[];
  /** Headings inside the main content root, in document order. */
  headings: { level: number; text: string }[];
  blocks: Block[];
  links: LinkInfo[];
  images: ImageInfo[];
  forms: FormInfo[];
  ctas: CtaInfo[];
  rootSelector: string;
};

export type JsonLdInfo = { ok: boolean; types: string[]; questions: string[]; error?: string };

export type ClaimFinding = {
  id: string;
  label: string;
  match: string;
  excerpt: string;
  /** Always true: a claim found on our own site is a claim to check, never evidence. */
  ownSiteClaim: true;
};

export type RawChecks = {
  canonical: string | null;
  canonicalMatchesFinalUrl: boolean | null;
  metaRobots: string | null;
  xRobotsTag: string | null;
  hreflang: { lang: string; href: string }[];
  openGraph: Record<string, string>;
  jsonLd: JsonLdInfo[];
  h1Count: number;
  headingOrder: string[];
  headingOrderIssues: string[];
  imagesMissingAlt: number;
  imagesEmptyAlt: number;
  linksToKnownRedirected: string[];
};

export type RawVsRendered = {
  onlyAfterJavaScript: { headings: string[]; links: string[]; blocks: string[] };
  onlyInRawHtml: { headings: string[]; links: string[]; blocks: string[] };
  rawWords: number;
  renderedWords: number;
};

export type TemplateIssue = { id: string; detail: string };

export type MobileSummary = { status: number | null; title: string; h1s: string[]; words: number; headingCount: number; headingsMissingVsDesktop: string[] };

export type PageRead = {
  requestedUrl: string;
  finalUrl: string | null;
  redirectChain: { url: string; status: number }[];
  status: number | null;
  fetchedAt: string;
  userAgent: string;
  ok: boolean;
  /** Why the read is incomplete (HTTP error, robots, access restriction). Absent when ok. */
  failure?: string;
  raw: DocExtract | null;
  rendered: DocExtract | null;
  mobile: MobileSummary | null;
  rawChecks: RawChecks | null;
  rawVsRendered: RawVsRendered | null;
  templateIssues: TemplateIssue[];
  claims: ClaimFinding[];
  words: number;
  markdown: string;
};
