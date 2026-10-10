// Task 2 check: every public table has RLS on, and the anon key cannot read rows.
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const tables = await client.query("select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1");
const noRls = tables.rows.filter((r) => !r.rowsecurity).map((r) => r.tablename);
console.log(`tables: ${tables.rowCount}; without RLS: ${noRls.length ? noRls.join(", ") : "none"}`);

// seed a row as owner so the anon read test is meaningful
await client.query("insert into app_settings (key, value) values ('rls_probe','1') on conflict do nothing");
const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const res = await fetch(`${base}/rest/v1/app_settings?select=key`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
const body = await res.json();
const leaked = Array.isArray(body) && body.length > 0;
console.log(`anon read of app_settings: HTTP ${res.status}, rows returned: ${Array.isArray(body) ? body.length : "error"}`);
await client.query("delete from app_settings where key = 'rls_probe'");
const wr = await fetch(`${base}/rest/v1/app_settings`, {
  method: "POST",
  headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
  body: JSON.stringify({ key: "anon_write", value: 1 }),
});
console.log(`anon write attempt: HTTP ${wr.status}`);
await client.end();
if (noRls.length || leaked || wr.ok) { console.error("FAIL"); process.exit(1); }
console.log("PASS");
