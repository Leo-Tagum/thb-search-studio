import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DeveloperChangeRequest, PublicationPackage, packageKindFor } from "./schema";

const valid = {
  article_id: "A-1", opportunity_id: "O-1", action: "UPDATE", approved_version_id: "abc123",
  existing_url: "https://www.twinhomebuyer.com/example/", suggested_slug: "example", page_title_h1: "H1",
  seo_title: "SEO title", meta_description: "Meta description", canonical_intent: "preserve", primary_intent: "seller question",
  geographic_scope: "Alameda County", sections: [{ section_id: "s1", heading: "H", content: "Text", supporting_evidence_ids: ["E-1"] }],
  internal_links: [{ target_url: "https://www.twinhomebuyer.com/x/", anchor_text: "link" }],
  media: [{ asset_id: "M1", alt_text: "alt", rights_status: "approved" }], schema_recommendations: ["Article"],
  claim_ledger_id: "C-1", fact_privacy_approval_id: "P-1", editorial_approval_id: "P-2", publisher_approval_id: "P-3",
};

describe("publication package schema", () => {
  it("accepts a complete package", () => { expect(PublicationPackage.safeParse(valid).success).toBe(true); });
  it("rejects UPDATE without existing_url", () => {
    const { existing_url: _drop, ...rest } = valid; void _drop;
    expect(PublicationPackage.safeParse(rest).success).toBe(false);
  });
  it("rejects a section with no evidence and media without approved rights", () => {
    expect(PublicationPackage.safeParse({ ...valid, sections: [{ ...valid.sections[0], supporting_evidence_ids: [] }] }).success).toBe(false);
    expect(PublicationPackage.safeParse({ ...valid, media: [{ asset_id: "M", alt_text: "a", rights_status: "unknown" }] }).success).toBe(false);
  });
  it("rejects a package missing any approval id", () => {
    expect(PublicationPackage.safeParse({ ...valid, publisher_approval_id: "" }).success).toBe(false);
  });
  it("routes template-rendered and protected pages to a Developer Change Request", () => {
    expect(packageKindFor("city", "unknown")).toBe("developer_change_request");
    expect(packageKindFor("unknown", "protected")).toBe("developer_change_request");
    expect(packageKindFor("unknown", "unknown")).toBe("publication_package");
    expect(DeveloperChangeRequest.safeParse({ page_url: "https://x.com/a/", reason_template_rendered: "city_template", requested_change: "x", evidence_ids: ["E1"], approval_id: "A", routed_to: "Gian" }).success).toBe(true);
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!["node_modules", ".next", ".git"].includes(n)) walk(p, out); }
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(n)) out.push(p);
  }
  return out;
}

describe("no-write guarantee", () => {
  const files = [...walk("src"), ...walk("scripts")].filter((f) => !f.endsWith("package.test.ts"));
  it("no source file issues a write verb against WordPress", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (!/wp-json|WP_BASE_URL|wp-admin|xmlrpc/i.test(src)) continue;
      expect(src, f).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/i);
      expect(src, f).not.toMatch(/\.(post|put|patch|delete)\(\s*[`"'][^`"']*wp-json/i);
    }
  });
  it("no WordPress credential names in source, .env.example or .env.local (names only)", () => {
    const re = /WP_(USER|USERNAME|PASS|PASSWORD|APP|APPLICATION|TOKEN|SECRET|KEY)|application[-_ ]password|wp-config/i;
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(re);
    expect(readFileSync(".env.example", "utf8")).not.toMatch(re);
    if (existsSync(".env.local")) {
      const names = readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => l.split("=")[0]);
      expect(names.filter((n) => re.test(n))).toEqual([]);
    }
  });
});
