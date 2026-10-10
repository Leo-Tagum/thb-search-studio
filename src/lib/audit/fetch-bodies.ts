// Polite bulk fetch of post bodies from the public WP REST API (read-only GET).
// Phase 2b: per_page=100 => 2 requests for ~122 posts, paced <=5/min, stops on 403/429/5xx and never retries.
import { createHash } from "node:crypto";

export type PostBody = { id: number; link: string; modified: string; content: { rendered: string } };
export type Limiter = { wait(): Promise<void> };
export class StopError extends Error {}

export const bodiesUrl = (base: string, page: number) =>
  `${base}/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=id,link,modified,content`;

export async function fetchPostBodies(base: string, limiter: Limiter, doFetch: typeof fetch = fetch): Promise<{ posts: PostBody[]; requests: number }> {
  const posts: PostBody[] = [];
  let requests = 0;
  for (let page = 1; ; page++) {
    await limiter.wait();
    requests++;
    const res = await doFetch(bodiesUrl(base, page), { headers: { "User-Agent": "THB-Search-Studio-audit/0.1 (internal, read-only)" } });
    if (res.status === 403 || res.status === 429 || res.status >= 500) throw new StopError(`STOP: HTTP ${res.status} on page ${page}; not retrying`);
    if (res.status === 400) break; // page past the end
    if (!res.ok) throw new StopError(`STOP: HTTP ${res.status} on page ${page}`);
    const rows = (await res.json()) as PostBody[];
    posts.push(...rows);
    if (page >= Number(res.headers.get("x-wp-totalpages") ?? "1") || !rows.length) break;
  }
  return { posts, requests };
}

export const contentHash = (html: string) => createHash("sha256").update(html).digest("hex");
