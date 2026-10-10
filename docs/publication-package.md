# Publication Package: the WordPress path

Decision (design §4): the Studio has **no WordPress write credentials and no write code**. Approved work leaves as a Publication Package; Leo assembles it in Elementor by hand.

- Format: [src/lib/package/schema.ts](../src/lib/package/schema.ts), following blueprint §10. Package fields include the approved version id, SEO title and meta, sections with evidence ids, internal links, media with approved rights, and the fact/privacy, editorial and publisher approval ids.
- UPDATE packages must carry the existing URL. Every section must cite evidence. Media must have approved rights.
- Template-rendered pages (city pages, protected Ads pages) never get a package. They get a **Developer Change Request** routed to Gian.
- Export format (YAML plus copy-ready section HTML) is built in Phase 4.
- Guard: `src/lib/package/package.test.ts` fails if any source file issues a write verb against WordPress or mentions a WordPress credential.
