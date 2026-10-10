-- Phase 2b: blog audit. RLS forced, no policies (as Phase 1). The Studio never writes to WordPress;
-- blog_audit_actions is only a manual action list for Leo and Gian.

-- Aggregated Search Console evidence for the audit (page and page x query over a long window, NO date dimension,
-- so ~16 months fit under the row cap). Kept apart from gsc_imports so the Phase 2 candidate engine is unaffected.
create table audit_gsc_imports (
  id uuid primary key default gen_random_uuid(),
  property text not null,
  start_date date not null,
  end_date date not null,
  data_state text not null default 'final',
  page_rows integer not null default 0,
  query_rows integer not null default 0,
  truncated boolean not null default false,
  caveats text[] not null default '{}',
  fetched_at timestamptz not null default now(),
  unique (property, start_date, end_date, data_state)
);
create table audit_gsc_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references audit_gsc_imports(id) on delete cascade,
  page_url text not null,
  page_id uuid references pages(id),
  query text,                       -- null = page-level totals (includes anonymized queries)
  clicks integer not null,
  impressions integer not null,
  position numeric
);
create index audit_gsc_rows_page on audit_gsc_rows (import_id, page_id);

create table blog_audits (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id),
  audit_run text not null,                 -- e.g. 2026-10-10; one row per post per run
  evidence jsonb not null,                 -- search, structure, overlap
  checks jsonb not null,                   -- content check findings (exact text flagged)
  proposed_verdict text not null check (proposed_verdict in ('KEEP','UPDATE','MERGE','RETIRE','NOINDEX','FLAG_ONLY')),
  target_page_id uuid references pages(id), -- MERGE survivor / RETIRE redirect target
  target_url text,
  reason text not null,
  confidence text not null check (confidence in ('low','medium','high')),
  unknowns text[] not null default '{}',
  protection_status text not null,
  agent_review jsonb,                       -- optional Agent 1 review for ambiguous cases
  status text not null default 'PROPOSED' check (status in ('PROPOSED','APPROVED','CHANGED','HELD')),
  final_verdict text check (final_verdict in ('KEEP','UPDATE','MERGE','RETIRE','NOINDEX','FLAG_ONLY')),
  final_target_url text,
  decision_reason text,
  decided_by text,
  decided_at timestamptz,
  protection_ack boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_id, audit_run)
);
create trigger blog_audits_updated before update on blog_audits for each row execute function set_updated_at();

create table blog_audit_actions (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references blog_audits(id),
  action text not null check (action in ('MERGE','RETIRE','NOINDEX')),
  old_url text not null,
  target_url text,                          -- null for NOINDEX
  reason text not null,
  evidence_summary text not null,
  status text not null default 'TO_DO' check (status in ('TO_DO','DONE','CANCELLED')),
  created_at timestamptz not null default now(),
  unique (audit_id)
);

alter table audit_gsc_imports enable row level security; alter table audit_gsc_imports force row level security;
alter table audit_gsc_rows enable row level security; alter table audit_gsc_rows force row level security;
alter table blog_audits enable row level security; alter table blog_audits force row level security;
alter table blog_audit_actions enable row level security; alter table blog_audit_actions force row level security;

grant all on all tables in schema public to service_role;
revoke all on all tables in schema public from anon, authenticated;
