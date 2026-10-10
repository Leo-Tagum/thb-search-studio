-- Phase 1 foundation schema (blueprint §12 entities + audit_events + jobs).
-- Rules: no seller name / street address / exact price columns. Dollar amounts and
-- exact dates live only in seller_brief_passages with visibility = 'internal_only'.
-- RLS is on for every table with NO policies: anon/authenticated are denied; only the
-- server-side service role (which bypasses RLS) can read or write.

create extension if not exists pgcrypto;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- settings, users, roles ----------
create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table roles (
  name text primary key,
  description text not null default ''
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null default '',
  roles text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- website inventory ----------
create table pages (
  id uuid primary key default gen_random_uuid(),
  wp_id integer,
  wp_type text not null check (wp_type in ('post','page','sitemap_only')),
  slug text not null default '',
  url text not null,
  canonical_url text not null unique,
  wp_status text,
  title text,
  meta_title text,
  meta_description text,
  h1 text,
  modified_at timestamptz,
  in_sitemap boolean not null default false,
  in_api boolean not null default false,
  -- protection defaults to 'unknown', never 'not_protected' (design §7)
  protection_status text not null default 'unknown' check (protection_status in ('unknown','protected','not_protected')),
  protection_reason text,
  protection_marked_by text,
  protection_marked_at timestamptz,
  template_flag text not null default 'unknown' check (template_flag in ('unknown','standard','city','protected_ads')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pages_wp_idx on pages (wp_type, wp_id);
create trigger pages_updated before update on pages for each row execute function set_updated_at();

create table page_snapshots (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id),
  fetched_at timestamptz not null default now(),
  http_status integer,
  content_hash text,
  body_text text
);

create table search_metrics (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references pages(id),
  query text,
  metric_date date,
  clicks integer, impressions integer, ctr numeric, position numeric,
  source text not null default 'gsc',
  window_note text
);

-- ---------- workflow ----------
create table opportunities (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references pages(id),
  action text check (action in ('CREATE','UPDATE','MERGE','HOLD','REJECT')),
  state text not null default 'CANDIDATE',
  prior_state text,
  version_hash text,
  packet jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger opportunities_updated before update on opportunities for each row execute function set_updated_at();

create table decisions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id),
  decision text not null,
  rationale text,
  decided_by text not null,
  created_at timestamptz not null default now()
);

create table articles (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id),
  title text,
  state text not null default 'CANDIDATE',
  prior_state text,
  revision_count integer not null default 0,
  locked_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger articles_updated before update on articles for each row execute function set_updated_at();

create table article_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id),
  version_hash text not null,
  body jsonb not null,
  reason text,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table article_sections (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id),
  position integer not null,
  heading text,
  body text,
  locked boolean not null default false
);

create table briefs (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id),
  outline jsonb,
  source_ids uuid[] not null default '{}',
  state text not null default 'BRIEF_REVIEW',
  created_at timestamptz not null default now()
);

-- ---------- evidence ----------
create table evidence_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_url text,
  storage_path text,
  source_tier integer not null check (source_tier between 1 and 6),
  jurisdiction text,
  effective_date date,
  retrieved_date date,
  recheck_by date,
  uploaded_by text not null,
  provenance_note text not null,
  content_sha256 text,
  created_at timestamptz not null default now()
);

create table evidence_passages (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references evidence_sources(id),
  passage text not null,
  locator text
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references articles(id),
  claim_text text not null,
  claim_type text,
  risk_level text not null check (risk_level in ('low','medium','high','critical')),
  source_id uuid references evidence_sources(id),
  supporting_passage text,
  jurisdiction text,
  applicability text,
  effective_or_verified_date date,
  checked_date date,
  confidence_status text,
  publication_permission text,
  requires_human_review boolean not null default false
);

-- ---------- seller experience library ----------
create table seller_briefs (
  id uuid primary key default gen_random_uuid(),
  case_id text not null unique,
  title text not null,
  use_level text not null check (use_level in ('FULL','SKIP ONE PART','BACKGROUND ONLY')),
  -- pending_review = Juan's open flags; blocks case-study use until cleared
  review_status text not null default 'cleared' check (review_status in ('pending_review','cleared')),
  review_note text,
  permission_text text,
  identity_risk_note text,
  source_file text not null,
  imported_at timestamptz not null default now()
);

create table seller_brief_passages (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references seller_briefs(id),
  section text not null,
  position integer not null,
  text text not null,
  visibility text not null check (visibility in ('publishable','internal_only')),
  internal_reasons text[] not null default '{}',
  not_for_publication boolean not null default false
);
-- internal-only passages are always not-for-publication
alter table seller_brief_passages add constraint internal_means_not_for_publication
  check (visibility <> 'internal_only' or not_for_publication);

create table seller_permissions (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references seller_briefs(id),
  publication_cleared boolean not null default false,
  approved_wording text,
  cleared_by text,
  cleared_at timestamptz,
  note text
);

-- ---------- brand facts ----------
create table brand_facts (
  id uuid primary key default gen_random_uuid(),
  fact_key text not null,
  fact_value text not null,
  source_ref text not null,
  status text not null default 'proposed' check (status in ('proposed','approved','conflict')),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table brand_fact_conflicts (
  id uuid primary key default gen_random_uuid(),
  fact_key text not null,
  variants jsonb not null,
  resolved_value text,
  resolved_by text,
  created_at timestamptz not null default now()
);

-- ---------- agents, review, approvals, publication ----------
create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null,
  subject_type text not null,
  subject_id uuid not null,
  status text not null default 'QUEUED',
  task_packet jsonb,
  output jsonb,
  prompt_version text,
  model_version text,
  retries integer not null default 0,
  created_at timestamptz not null default now()
);

create table audit_findings (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references articles(id),
  agent_run_id uuid references agent_runs(id),
  severity text not null,
  finding text not null,
  created_at timestamptz not null default now()
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id uuid not null,
  version_hash text not null,
  decision text not null check (decision in ('approve','hold','request_changes')),
  approver_identity text not null,
  decided_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  invalidated_at timestamptz
);

create table publication_packages (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references articles(id),
  version_hash text not null,
  package jsonb not null,
  created_at timestamptz not null default now()
);

-- kept but unused while publication is package-only; no WordPress credentials exist
create table wordpress_drafts (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references articles(id),
  wp_draft_id integer,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create table publication_events (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references articles(id),
  event text not null,
  url text,
  actor text not null,
  created_at timestamptz not null default now()
);

create table measurement_snapshots (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references pages(id),
  window_start date, window_end date,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table integration_health (
  id uuid primary key default gen_random_uuid(),
  integration text not null,
  ok boolean not null,
  detail text,
  checked_at timestamptz not null default now()
);

create table test_results (
  id uuid primary key default gen_random_uuid(),
  suite text not null,
  case_name text not null,
  passed boolean not null,
  detail text,
  run_at timestamptz not null default now()
);

-- ---------- audit log (append-only) and jobs ----------
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor text not null,
  subject_type text not null,
  subject_id text not null,
  event_type text not null,
  prior_state text,
  new_state text,
  version_hash text,
  accepted boolean not null default true,
  detail jsonb
);
create index audit_events_subject_idx on audit_events (subject_type, subject_id, at);

create or replace function audit_events_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_events is append-only'; end $$;
create trigger audit_events_no_update before update or delete on audit_events
  for each row execute function audit_events_immutable();

create table jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  idempotency_key text not null unique,
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','done','failed','dead')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  -- a dead job maps to INTEGRATION_ERROR on its subject
  resulting_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger jobs_updated before update on jobs for each row execute function set_updated_at();

-- ---------- RLS: on everywhere, deny by default ----------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);
  end loop;
end $$;

insert into roles (name, description) values
  ('operator','Runs agent steps, imports data'),
  ('seo_reviewer','Clears SEO opportunity and brief gates'),
  ('evidence_reviewer','Clears the evidence gate'),
  ('fact_privacy_reviewer','Clears fact and privacy gate'),
  ('publisher','Final human sign-off'),
  ('secondary_approver','Independent approval for sensitive exceptions');

insert into app_settings (key, value) values
  ('role_assignments', '{"leo":["operator","seo_reviewer","evidence_reviewer","fact_privacy_reviewer"],"juan":["publisher"]}'),
  ('rate_limit_requests_per_minute', '20');
