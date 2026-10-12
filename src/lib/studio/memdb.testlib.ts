/* eslint-disable @typescript-eslint/no-explicit-any */
// Test helper (not a test file): an in-memory stand-in for the Supabase client with filters, ordering, ranges, insert/update/delete, logging every write.
import { randomUUID } from "node:crypto";

export type Log = { op: "insert" | "update" | "delete"; table: string; rows: any[] };
export function memDb(seed: Record<string, any[]>) {
  const t: Record<string, any[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
  const log: Log[] = [];
  const clone = (x: any) => JSON.parse(JSON.stringify(x));
  const db = {
    from(table: string) {
      const rows = () => (t[table] ??= []);
      let op: "select" | "insert" | "update" | "delete" = "select", payload: any, head = false, ord: string | null = null, asc = true, lim: number | null = null, rng: [number, number] | null = null, one = false;
      const filters: ((r: any) => boolean)[] = [];
      const run = (): any => {
        const m = rows().filter((r) => filters.every((f) => f(r)));
        if (op === "insert") { const arr = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...clone(r) })); rows().push(...arr); log.push({ op, table, rows: clone(arr) }); return { data: one ? arr[0] : arr, error: null }; }
        if (op === "update") { m.forEach((r) => Object.assign(r, clone(payload))); log.push({ op, table, rows: clone(m) }); return { data: m, error: null }; }
        if (op === "delete") { t[table] = rows().filter((r) => !m.includes(r)); log.push({ op, table, rows: clone(m) }); return { data: m, error: null }; }
        let out = [...m]; if (ord) out.sort((a, b) => (asc ? 1 : -1) * String(a[ord!]).localeCompare(String(b[ord!]))); if (rng) out = out.slice(rng[0], rng[1] + 1); if (lim !== null) out = out.slice(0, lim);
        if (one) return out.length ? { data: clone(out[0]), error: null } : { data: null, error: { message: "no rows" } };
        return { data: head ? null : clone(out), error: null, count: m.length };
      };
      const b: any = {
        select(_c?: string, o?: any) { if (o?.head) head = true; return b; },
        insert(p: any) { op = "insert"; payload = p; return b; }, update(p: any) { op = "update"; payload = p; return b; }, delete() { op = "delete"; return b; },
        eq(c: string, v: any) { filters.push((r) => r[c] === v); return b; }, in(c: string, v: any[]) { filters.push((r) => v.includes(r[c])); return b; },
        is(c: string, v: any) { filters.push((r) => (r[c] ?? null) === v); return b; }, order(c: string, o?: { ascending?: boolean }) { ord = c; asc = o?.ascending !== false; return b; }, limit(n: number) { lim = n; return b; }, range(a: number, z: number) { rng = [a, z]; return b; },
        single() { one = true; return Promise.resolve(run()); }, maybeSingle() { one = true; const r = run(); return Promise.resolve(r.data ? r : { data: null, error: null }); },
        then(res: any, rej?: any) { return Promise.resolve(run()).then(res, rej); },
      };
      return b;
    },
  } as any;
  return { db, t, log };
}

