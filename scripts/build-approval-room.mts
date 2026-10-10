// Builds the THB Approval Room page file from the fixed template and a proposal payload (or an empty room).
// Usage: npx tsx scripts/build-approval-room.mts <payload.json|empty> <out.html>
// The page is republished to the SAME artifact URL for every proposal, so sharing is set once.
import { readFileSync, writeFileSync } from "node:fs";

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error("usage: build-approval-room.mts <payload.json|empty> <out.html>");
const payload = src === "empty" ? {} : JSON.parse(readFileSync(src, "utf8"));
// Keep the JSON safe inside a <script> element: no "</script>", no HTML comment starts, no line separators.
const safe = JSON.stringify(payload).replace(/</g, "\u003c").replace(/\u2028/g, "\u2028").replace(/\u2029/g, "\u2029");
const html = readFileSync("src/approval-room/template.html", "utf8").replace("__PAYLOAD__", () => safe);
writeFileSync(out, html);
console.log(`wrote ${out} (${html.length} bytes, ${src === "empty" ? "empty room" : `proposal ${payload.proposal_id}`})`);
