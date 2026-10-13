// Phase 3d adversarial fixtures. FIXTURE DATA ONLY: invented sentences used to prove that text the classic loop writes cannot reach HUMAN_REVIEW with
// a defect the old fact gate (Agent 5) let through. Nothing here is true, none of it describes a real seller, and none of it is ever published.
// Each case adds ONE poisoned sentence to an otherwise clean unit (the hoarder fixture units from hoarder-units.ts in the live smoke, a small clean unit in the Vitest tests).
import type { Unit } from "../../src/lib/studio/schema";

export type AdversarialCase = {
  id: "legal-claim" | "generalization" | "local-fact" | "seller-anecdote";
  describe: string;
  unitKey: string;                 // the hoarder fixture unit the sentence is added to in the live smoke
  sentence: string;                // the poisoned sentence
  /** Which layer must catch it. "code" = a deterministic check or the hedge flag fires with no agent; "V1" = only V1's judgment can (the live run measures it). */
  caught: { code: string[]; v1: boolean };
  /** What V1's must-fix (or hedge ruling) must point at, as a pattern on the sentence it cites. */
  citesPattern: RegExp;
  /** A blunter wording of the same defect that a deterministic check catches with no agent at all (tested in Vitest; the live run uses the subtle wording above). */
  blunt?: { sentence: string; code: string };
};

export const ADVERSARIAL: AdversarialCase[] = [
  {
    id: "legal-claim",
    describe: "A newly invented legal claim: a statute-sounding duty that no ledger claim supports.",
    unitKey: "s4",
    sentence: "California law requires you to tell your neighbors about a hoarding condition in writing before you list the house.",
    caught: { code: [], v1: true },
    citesPattern: /neighbors/i,
  },
  {
    id: "generalization",
    describe: "An unsupported generalization (usually / most owners / never) about what sellers do or what happens.",
    unitKey: "s5",
    sentence: "Most owners in this spot wait too long, and you will usually pay more the longer you wait, so you should never delay.",
    caught: { code: ["HEDGE_FLAG"], v1: true },
    citesPattern: /(most owners|usually|never)/i,
  },
  {
    id: "local-fact",
    describe: "An unverified local fact: a specific city or county rule stated as fact, with no ledger claim and no figure. (Before Stage 6 part A only V1 could catch it; now the code flags a rule of a named place that no cited claim covers.)",
    unitKey: "s3",
    sentence: "The Alameda County code enforcement office inspects every hoarded house before a sale closes and blocks the closing until the house is cleared.",
    caught: { code: ["LOCAL_RULE_WITHOUT_CLAIM"], v1: true },      // since Stage 6 part A the code catches this too (a rule of a named county needs a claim for that county); V1 still judges it
    citesPattern: /(alameda county|code enforcement)/i,
  },
  {
    id: "seller-anecdote",
    describe: "A seller-identifying anecdote: a real-sounding family, place and outcome, with no cleared seller story behind it.",
    unitKey: "s2",
    sentence: "A family in the Fruitvale neighborhood kept every newspaper from their late father's years in the garage, and the county inspector who came by was kind about it.",
    caught: { code: [], v1: true },
    citesPattern: /(family|fruitvale|inspector)/i,
    blunt: { sentence: "Last spring a widow we helped in the Fruitvale neighborhood told us her late husband's collection filled every room of the house.", code: "SELLER_STORY_NOT_CLEARED" },
  },
];

/** The unit with the poisoned sentence added as its own paragraph (after the first block, so the heading and capsule stay as they were). */
export function poisoned(base: Unit, sentence: string): Unit {
  const u = structuredClone(base) as Unit;
  if (u.kind === "faq") { u.items[0] = { ...u.items[0], a: `${u.items[0].a} ${sentence}` }; return u; }
  u.blocks.splice(1, 0, { t: "p", text: sentence } as never);
  return u;
}
