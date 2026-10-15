// Shared types for the visual page-type check and the human review loop. Everything here is plain data. Nothing in this module reaches WordPress, redirects or Search Console.

export const PAGE_TYPES = ["money page", "city/location page", "ads landing page", "guide/blog", "story/case study", "utility", "other"] as const;
export type PageType = (typeof PAGE_TYPES)[number];
export type Confidence = "high" | "medium" | "low";

/** Money and city pages share a commercial family for the type comparison only; geography, seller problem and purpose are still checked. */
export const COMMERCIAL: readonly PageType[] = ["money page", "city/location page"];

export type PageInfo = {
  url: string;
  wpType: "page" | "post" | "unknown";
  visualType: PageType;
  confidence: Confidence;
  evidence: string[];
  /** Plain-words purpose, one line (for the card). */
  purposeText: string;
  /** Purpose tags (seller problem or topic) found in the title, H1 and address. */
  purposes: string[];
  /** "city:San Mateo", "statewide", "general" (Bay Area or no place), or "none". */
  geography: string;
  protected: boolean;
  /** True when the fresh crawl differs from the crawl the decision was based on (title, H1, size, status, final address). */
  changedSinceDecision: string | null;
  /** Headings of approved sections written for this page and waiting to be published (from publish-manifest.json). They count for the purpose check, as a "confirm" flag only. */
  pendingHeadings?: string[];
  /** How the page type was set: the rules, or Leo's/the agent's visual review overriding them. */
  source: "rules" | "visual-review";
};

export type MapRow = { oldUrl: string; newUrl: string; group: string; status: string; contentFirst: string; notes: string; raw?: string };

export type Flag = { id: string; rule: string; severity: "hold" | "confirm" };
export type Proposed = { kind: "hold" | "none"; text: string };

export type ScreenshotRef = { kind: "desktop-top" | "desktop-full" | "mobile-top" | "mobile-full"; file: string; assetId?: string; width: number; height: number; bytes: number };
export type Card = {
  id: string; test?: boolean;
  group: string; row: { oldUrl: string; newUrl: string; status: string; group: string };
  existingDecision: string;
  confirmedException: string | null;
  source: PageInfo & { shots: ScreenshotRef[] };
  destination: (PageInfo & { shots: ScreenshotRef[] }) | null;
  flags: Flag[]; proposed: Proposed;
};
export type Unflagged = { oldUrl: string; newUrl: string; group: string; sourceType: PageType; destinationType: PageType | null; note: "No new issue detected; existing decision unchanged." };

export type AnswerAction = "agree" | "keep_existing" | "change_type" | "change_decision";
export type Answer = {
  cardId: string; action: AnswerAction;
  /** change_type: which page, and the type Leo says it is. */
  typeTarget?: "source" | "destination"; newType?: PageType;
  /** change_decision: what Leo chose. */
  newDecision?: string;
  note?: string; decidedAt: string; displayName?: string; test?: boolean;
};
