// Phase 0 step 5 check: fail if any secret value from .env.local appears in the browser bundle.
// Prints only names and counts, never values.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)).filter(Boolean)
    .map((m) => [m![1], m![2].replace(/^["']|["']$/g, "")]),
);
const secretNames = Object.keys(env).filter((k) => /SERVICE|SECRET|PRIVATE/i.test(k) && env[k].length > 8);
const files: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk(".next/static");
let bad = 0;
for (const name of secretNames) {
  const hits = files.filter((f) => readFileSync(f, "utf8").includes(env[name]));
  console.log(`${name}: ${hits.length === 0 ? "not found in .next/static" : "FOUND in " + hits.length + " file(s)"}`);
  bad += hits.length;
}
console.log(`scanned ${files.length} files for ${secretNames.length} secret(s)`);
process.exit(bad ? 1 : 0);
export {};
