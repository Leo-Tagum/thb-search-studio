-- Migration 0021, approved by Leo 2026-10-13 (reviewed SQL and rollback; rollback in supabase/rollbacks/0021_image_planner.down.sql).
-- Phase 3e: image planner (Agent 8 / D1) tables and the private master bucket. Additive: no existing table or column changes.
-- RLS forced, no policies, grants as in 0012 (the Studio uses the service role; anon and authenticated get nothing).
-- Nothing here writes to article_sections, article_versions or any approval table, so no article hash and no fingerprint changes.

create table image_plans (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id),
  text_version_hash text not null,            -- the locked text version the plan was made for
  status text not null default 'PLANNED' check (status in ('PLANNED','V1_CHECKED','ON_BOARD','IN_PROGRESS','ALL_DONE','LEO_CHECKED','STALE','SUPERSEDED')),
  agent_run_id uuid references agent_runs(id),
  created_at timestamptz not null default now()
);
create index image_plans_article_idx on image_plans(article_id);

create table image_cards (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references image_plans(id),
  card_key text not null,
  unit_key text not null,
  unit_hash text not null,                    -- STALE when the unit is relocked with a new hash
  anchor jsonb not null,                      -- {after, block_index}
  type text not null check (type in ('infographic','diagram_flowchart','checklist_graphic','comparison_graphic','illustration','stock_photo','icon_set')),
  purpose text not null,
  description text not null,
  image_text jsonb not null default '[]'::jsonb,   -- verbatim lines with source_unit and source_block
  claim_ids text[] not null default '{}',
  alt_text text not null,
  privacy_notes text not null,
  aspect jsonb not null,                      -- {ratio, width_px, height_px}
  priority text not null check (priority in ('must_have','nice_to_have')),
  state text not null default 'PLANNED' check (state in ('PLANNED','V1_CHECKED','ON_BOARD','IN_PROGRESS','DONE','STALE','SUPERSEDED')),
  unique (plan_id, card_key)
);

create table image_uploads (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references image_cards(id),
  version_no integer not null check (version_no >= 1),
  file_name text not null,
  storage_path text not null unique,                 -- article-images/articles/<article>/<card>/v<n>_<sha>.<ext>, never overwritten
  asset_id text,                              -- the board's asset id, kept for traceability
  sha256 text not null,
  bytes integer not null,
  mime text not null,
  width integer,
  height integer,
  uploaded_by text,
  vision_seen_text jsonb,                     -- model transcription, a flagging aid only
  vision_flags jsonb not null default '[]'::jsonb,
  leo_check jsonb,                            -- {checked_by, checked_at, note}
  created_at timestamptz not null default now(),
  unique (card_id, version_no)
);

alter table image_plans enable row level security; alter table image_plans force row level security;
alter table image_cards enable row level security; alter table image_cards force row level security;
alter table image_uploads enable row level security; alter table image_uploads force row level security;
grant all on image_plans, image_cards, image_uploads to service_role;
revoke all on image_plans, image_cards, image_uploads from anon, authenticated;

-- Private master bucket (never public), same pattern as 0005, with a 10 MB file limit and only PNG, JPEG, WebP and SVG (Leo, 2026-10-13).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('article-images', 'article-images', false, 10485760, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/png','image/jpeg','image/webp','image/svg+xml'];
