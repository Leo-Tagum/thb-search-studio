// Publication Package: the ONLY handoff path to WordPress (Leo assembles in Elementor by hand).
// Format follows blueprint §10. The app holds no WordPress write credentials.
import { z } from "zod";

const url = z.string().url();

export const PublicationPackage = z
  .object({
    article_id: z.string().min(1),
    opportunity_id: z.string().min(1),
    action: z.enum(["CREATE", "UPDATE"]),
    approved_version_id: z.string().min(1), // immutable version; must equal the approved hash
    existing_url: url.optional(), // required on UPDATE
    suggested_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    page_title_h1: z.string().min(1),
    seo_title: z.string().min(1).max(70),
    meta_description: z.string().min(1).max(170),
    canonical_intent: z.string().min(1),
    primary_intent: z.string().min(1),
    geographic_scope: z.string().min(1),
    sections: z
      .array(
        z.object({
          section_id: z.string().min(1),
          heading: z.string().min(1),
          content: z.string().min(1),
          supporting_evidence_ids: z.array(z.string()),
        }),
      )
      .min(1),
    internal_links: z.array(z.object({ target_url: url, anchor_text: z.string().min(1) })),
    media: z.array(z.object({ asset_id: z.string(), alt_text: z.string().min(1), rights_status: z.enum(["approved", "pending", "unknown"]) })),
    schema_recommendations: z.array(z.string()),
    claim_ledger_id: z.string().min(1),
    fact_privacy_approval_id: z.string().min(1),
    editorial_approval_id: z.string().min(1),
    publisher_approval_id: z.string().min(1),
  })
  .superRefine((p, ctx) => {
    if (p.action === "UPDATE" && !p.existing_url) ctx.addIssue({ code: "custom", path: ["existing_url"], message: "UPDATE requires existing_url" });
    if (p.media.some((m) => m.rights_status !== "approved")) ctx.addIssue({ code: "custom", path: ["media"], message: "all media must have approved rights" });
    for (const s of p.sections) if (s.supporting_evidence_ids.length === 0) ctx.addIssue({ code: "custom", path: ["sections"], message: `section ${s.section_id} has no supporting evidence ids` });
  });
export type PublicationPackage = z.infer<typeof PublicationPackage>;

// Template-rendered pages (city pages, protected Ads pages) never get an Elementor package:
// they get a Developer Change Request for Gian (design §7). No live-vs-patch diff is attempted.
export const DeveloperChangeRequest = z.object({
  page_url: url,
  reason_template_rendered: z.enum(["city_template", "protected_ads", "other"]),
  requested_change: z.string().min(1),
  evidence_ids: z.array(z.string()).min(1),
  approval_id: z.string().min(1),
  routed_to: z.literal("Gian"),
});
export type DeveloperChangeRequest = z.infer<typeof DeveloperChangeRequest>;

export function packageKindFor(templateFlag: string, protection: string): "publication_package" | "developer_change_request" {
  return templateFlag === "city" || templateFlag === "protected_ads" || protection === "protected" ? "developer_change_request" : "publication_package";
}
