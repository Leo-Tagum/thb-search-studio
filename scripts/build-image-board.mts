// Builds the Image board page file from the fixed template and a board payload (cards for ONE article). Local file only: this script publishes nothing and shares nothing.
// Usage: npx tsx scripts/build-image-board.mts <payload.json> <out.html>
// The board is a separate artifact from the Approval Room (one per article). Until Leo approves the interface, only fixture payloads are built.
import { readFileSync, writeFileSync } from "node:fs";

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error("usage: build-image-board.mts <payload.json> <out.html>");
const payload = JSON.parse(readFileSync(src, "utf8"));
for (const c of payload.cards ?? []) for (const k of ["card_id", "title", "purpose", "placement", "generation_prompt", "avoid", "text_overlay", "aspect_ratio", "design_brief", "base_file_name", "card_version"]) if (c[k] === undefined) throw new Error(`card ${c.card_id ?? "?"} has no ${k}`);
// Keep the JSON safe inside a <script> element: no "</script>", no HTML comment starts, no line separators.
const safe = JSON.stringify(payload).replace(/</g, "\\u003c").split(String.fromCharCode(0x2028)).join("\\u2028").split(String.fromCharCode(0x2029)).join("\\u2029");
const html = readFileSync("src/image-board/template.html", "utf8").replace("__PAYLOAD__", () => safe);
writeFileSync(out, html);
console.log(`wrote ${out} (${html.length} bytes, ${payload.cards.length} cards, ${payload.board.fixture ? "FIXTURE" : "real"} board)`);
