-- Phase 3: Content Studio. RLS forced, no policies (as Phase 1). The Studio never writes to WordPress.

-- Sections: one row per H2 section of an article. The text lives in section_versions; a lock freezes one version.
alter table article_sections add column if not exists section_key text;
alter table article_sections add column if not exists status text not null default 'NEEDS_WRITE';
alter table article_sections add column if not exists current_version_id uuid;
alter table article_sections add column if not exists locked_version_id uuid;
alter table article_sections add column if not exists fact_passed_version_id uuid;
alter table article_sections add column if not exists seo_passed_version_id uuid;
alter table article_sections add column if not exists issues jsonb not null default '[]'::jsonb; -- open issues with attempt counts
alter table article_sections add column if not exists brief_h2 text;
alter table article_sections add column if not exists claim_ids text[] not null default '{}';
create unique index if not exists article_sections_key on article_sections (article_id, section_key);

create table section_versions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references article_sections(id),
  version_no integer not null,
  content jsonb not null,            -- the structured section (h2, blocks, claim_ids, roles)
  content_hash text not null,
  material_sig text not null,        -- hash of the risky tokens + claim ids: a change here re-enters fact review
  reason text,
  created_by text not null,          -- agent key or a human id
  agent_run_id uuid references agent_runs(id),
  created_at timestamptz not null default now(),
  unique (section_id, version_no)
);

create table section_reviews (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references article_sections(id),
  version_id uuid not null references section_versions(id),
  agent_key text not null,
  decision text not null,
  findings jsonb not null default '[]'::jsonb,
  required_actions jsonb not null default '[]'::jsonb,
  advisory_score integer,            -- Agent 7 only; advisory, never a gate
  agent_run_id uuid references agent_runs(id),
  created_at timestamptz not null default now()
);

create table escalations (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id),
  section_id uuid references article_sections(id),
  issue_key text not null,
  reason text not null,
  attempts integer not null,
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED')),
  resolution text,
  resolved_by text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Claim ledger (blueprint §6). The Phase 1 'claims' table gets the fields the Studio needs.
alter table claims add column if not exists claim_key text;       -- clm:N from the brief, or new:<section>:<n>
alter table claims add column if not exists section_key text;
alter table claims add column if not exists text_hash text;
alter table claims add column if not exists locked_text text;     -- exact verified wording once Agent 5 has passed it
alter table claims add column if not exists declared_by text;
alter table claims add column if not exists support text not null default 'supported';
create unique index if not exists claims_article_key on claims (article_id, claim_key);

alter table articles add column if not exists slug text;
alter table articles add column if not exists brief_id uuid references briefs(id);
alter table articles add column if not exists proposal_note text;

-- Approvals: each decision records the proposal item it was for.
alter table approvals add column if not exists proposal_id uuid;
alter table approvals add column if not exists item_kind text not null default 'article';

-- Approver registry: registered by first click and confirmed by Leo. Only confirmed approvers count.
create table approver_registry (
  viewer_id text primary key,
  display_name text,
  role text check (role in ('approver','secondary','operator')),   -- operator = Leo's own account: feedback only
  label text,                         -- "Juan", "Cherry"
  status text not null default 'PENDING' check (status in ('PENDING','CONFIRMED','REJECTED')),
  first_seen_at timestamptz not null default now(),
  confirmed_by text,
  confirmed_at timestamptz,
  constraint operator_or_confirmed check (status <> 'CONFIRMED' or role is not null)
);

-- Everything the sync reads from the Approval Room: accepted or not. Feedback is stored here too.
create table approval_sync_log (
  id uuid primary key default gen_random_uuid(),
  synced_at timestamptz not null default now(),  -- server time of this sync; the only time that counts
  record_id text not null,                       -- artifact record id
  proposal_id text,
  item_kind text,
  viewer_id text,
  decision text,
  claimed_hash text,
  recomputed_hash text,
  server_updated_at timestamptz,                 -- record's platform updatedAt
  browser_decided_at text,                       -- untrusted note only
  classification text not null,                  -- APPROVAL | FEEDBACK | REJECTED
  accepted boolean not null,
  reason text,
  unique (record_id, server_updated_at)
);

-- Voice reference is provisionally approved by Leo; Juan confirms with the first article.
alter table brand_facts add column if not exists provisional_by text;
alter table brand_facts add column if not exists provisional_at timestamptz;

alter table section_versions enable row level security; alter table section_versions force row level security;
alter table section_reviews enable row level security; alter table section_reviews force row level security;
alter table escalations enable row level security; alter table escalations force row level security;
alter table approver_registry enable row level security; alter table approver_registry force row level security;
alter table approval_sync_log enable row level security; alter table approval_sync_log force row level security;

grant all on all tables in schema public to service_role;
revoke all on all tables in schema public from anon, authenticated;
