// The structured article an agent writes. The renderer (template.ts) turns it into the thb-article body.
// The author box, Related Guides, Sources and CTA box are NOT in this schema: code composes them.
import { z } from "zod";
import { parseInline } from "./inline";

export const ROLES = ["opening", "options", "real_world_warning", "professional_confirmation"] as const;
export type Role = (typeof ROLES)[number];

const str = z.string().min(1).max(3000);
export const block = z.discriminatedUnion("t", [
  z.strictObject({ t: z.literal("p"), text: str }),
  z.strictObject({ t: z.literal("ul"), items: z.array(str).min(1).max(20) }),
  z.strictObject({ t: z.literal("ol"), items: z.array(str).min(1).max(20) }),
  z.strictObject({ t: z.literal("table"), headers: z.array(str).min(2).max(5), rows: z.array(z.array(str).min(2).max(5)).min(1).max(12) }),
  z.strictObject({ t: z.literal("callout"), text: str.optional(), items: z.array(str).max(10).optional() }),
  z.strictObject({ t: z.literal("note"), text: str }),
  z.strictObject({ t: z.literal("h3"), text: str }),
]);
export type Block = z.infer<typeof block>;

export const section = z.strictObject({
  kind: z.literal("section"),
  key: z.string().regex(/^s\d{1,2}$/),
  h2: str.max(200),
  capsule: str.optional(),                 // only on the first section: the 40-60 word answer capsule
  blocks: z.array(block).min(1).max(30),
  claim_ids: z.array(z.string()),
  roles: z.array(z.enum(ROLES)),
});
export const faq = z.strictObject({
  kind: z.literal("faq"),
  key: z.literal("faq"),
  items: z.array(z.strictObject({ q: str.max(250), a: str.max(700), claim_ids: z.array(z.string()) })).min(3).max(10),
});
export const unit = z.discriminatedUnion("kind", [section, faq]);
export type Section = z.infer<typeof section>;
export type Faq = z.infer<typeof faq>;
export type Unit = z.infer<typeof unit>;

export type Draft = { title: string; slug: string; units: Unit[] };

/** All strings in a unit that readers will see, in reading order (used by every text check). */
export function unitStrings(u: Unit): string[] {
  if (u.kind === "faq") return u.items.flatMap((i) => [i.q, i.a]);
  const out: string[] = [u.h2];
  if (u.capsule) out.push(u.capsule);
  for (const b of u.blocks) {
    if (b.t === "table") out.push(...b.headers, ...b.rows.flat());
    else if (b.t === "ul" || b.t === "ol") out.push(...b.items);
    else if (b.t === "callout") out.push(...(b.text ? [b.text] : []), ...(b.items ?? []));
    else out.push(b.text);
  }
  return out;
}
/** Reader-visible text (link URLs and markup stripped): every text check and the material signature use this, never the raw source. */
export const unitText = (u: Unit) => unitStrings(u).map((x) => parseInline(x).plain).join("\n");
export const unitClaimIds = (u: Unit): string[] => (u.kind === "faq" ? [...new Set(u.items.flatMap((i) => i.claim_ids))] : u.claim_ids);
