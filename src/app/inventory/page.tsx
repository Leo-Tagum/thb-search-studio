import { Suspense } from "react";
import { supabaseAdmin } from "@/lib/supabase-server";
import { markProtectionAction } from "../actions";

async function InventoryContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const db = supabaseAdmin();
  const { data: all } = await db.from("pages").select("wp_type,protection_status,template_flag,in_sitemap");
  const rows = all ?? [];
  const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  let query = db.from("pages").select("id,wp_type,slug,url,title,meta_title,in_sitemap,protection_status,protection_reason,template_flag").order("url").limit(500);
  if (q("type")) query = query.eq("wp_type", q("type"));
  if (q("template")) query = query.eq("template_flag", q("template"));
  if (q("protection")) query = query.eq("protection_status", q("protection"));
  const { data: pages } = await query;
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">Inventory</h1>
      <p className="text-sm">
        {rows.length} unique canonical URLs ({count((r) => r.wp_type === "post")} posts, {count((r) => r.wp_type === "page")} pages,
        {" "}{count((r) => r.wp_type === "sitemap_only")} sitemap-only); {count((r) => !r.in_sitemap)} not in sitemap.
        {" "}Protection unknown: {count((r) => r.protection_status === "unknown")}. City-template flagged (inferred from slug): {count((r) => r.template_flag === "city")}.
      </p>
      <form className="flex gap-2 text-sm">
        <select name="type" defaultValue={q("type")}><option value="">any type</option><option>post</option><option>page</option></select>
        <select name="template" defaultValue={q("template")}><option value="">any template</option><option>city</option><option>unknown</option></select>
        <select name="protection" defaultValue={q("protection")}><option value="">any protection</option><option>unknown</option><option>protected</option><option>not_protected</option></select>
        <button className="border px-2">Filter</button>
      </form>
      <table className="w-full text-xs">
        <thead><tr className="text-left"><th>URL</th><th>Type</th><th>Title</th><th>Protection</th><th>Template</th><th>Mark protection (reason required)</th></tr></thead>
        <tbody>
          {(pages ?? []).map((p) => (
            <tr key={p.id} className="border-t align-top">
              <td className="break-all">{p.url}</td><td>{p.wp_type}</td><td>{p.meta_title ?? p.title}</td>
              <td>{p.protection_status}{p.protection_reason ? ` (${p.protection_reason})` : ""}</td><td>{p.template_flag}</td>
              <td>
                <form action={markProtectionAction} className="flex gap-1">
                  <input type="hidden" name="pageId" value={p.id} />
                  <select name="status" defaultValue={p.protection_status}><option>unknown</option><option>protected</option><option>not_protected</option></select>
                  <input name="reason" required placeholder="reason" className="border px-1" />
                  <button className="border px-1">Save</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

export default function Inventory(props: PageProps<"/inventory">) {
  return <Suspense fallback={<p className="text-sm">Loading…</p>}><InventoryContent searchParams={props.searchParams} /></Suspense>;
}
