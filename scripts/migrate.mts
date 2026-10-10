// Applies supabase/migrations/*.sql in order, once each. Run: npm run db:migrate
// Reads SUPABASE_DB_URL from the environment (never printed).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("SUPABASE_DB_URL missing");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
await client.query("alter table schema_migrations enable row level security");
const dir = join(process.cwd(), "supabase", "migrations");
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  const done = await client.query("select 1 from schema_migrations where name = $1", [f]);
  if (done.rowCount) { console.log("skip", f); continue; }
  await client.query("begin");
  try {
    await client.query(readFileSync(join(dir, f), "utf8"));
    await client.query("insert into schema_migrations (name) values ($1)", [f]);
    await client.query("commit");
    console.log("applied", f);
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}
await client.end();
