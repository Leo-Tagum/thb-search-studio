-- Phase 2: Engine A (GSC import, candidates, agent bridge). RLS forced, no policies (as Phase 1).

create table gsc_imports (
  id uuid primary key default gen_random_uuid(),
  property text not null,
  start_date date not null,
  end_date date not null,
  data_state text not null default 'final',
  dimensions text[] not null default '{page,query,date}',
  row_limit integer not null,
  rows_fetched integer not null default 0,
  truncated boolean not null default false,
  caveats text[] not null default '{}',
  fetched_at timestamptz not null default now(),
  unique (property, start_date, end_date, data_state)
);
alter table gsc_imports enable row level security;
alter table gsc_imports force row level security;

alter table search_metrics add column if not exists import_id uuid references gsc_imports(id) on delete cascade;
alter table search_metrics add column if not exists page_url text;
create unique index if not exists search_metrics_key on search_metrics (import_id, page_url, query, metric_date);
create index if not exists search_metrics_page on search_metrics (page_id);

alter table opportunities add column if not exists title text;
alter table opportunities add column if not exists target_intent text;
alter table opportunities add column if not exists scope text;
alter table opportunities add column if not exists intent_key text;
alter table opportunities add column if not exists score jsonb;
alter table opportunities add column if not exists data_gaps jsonb;
alter table opportunities add column if not exists protected_warning boolean not null default false;
alter table opportunities add column if not exists template_flag text;
alter table opportunities add column if not exists proposed_action text;
alter table opportunities add column if not exists agent_decision jsonb;
alter table opportunities add column if not exists human_decision text;
alter table opportunities add column if not exists human_reason text;
alter table opportunities add column if not exists protection_ack boolean not null default false;
alter table opportunities add column if not exists dev_change_request boolean not null default false;
create unique index if not exists opportunities_intent_key on opportunities (intent_key) where intent_key is not null;

alter table agent_runs add column if not exists error text;
alter table agent_runs add column if not exists updated_at timestamptz not null default now();
alter table briefs add column if not exists evidence_packet jsonb;
alter table briefs add column if not exists notes text;

-- rejected intents stay rejected until new evidence is recorded
create table rejected_intents (
  intent_key text primary key,
  opportunity_id uuid references opportunities(id),
  reason text not null,
  rejected_by text not null,
  rejected_at timestamptz not null default now(),
  new_evidence_note text
);
alter table rejected_intents enable row level security;
alter table rejected_intents force row level security;

grant all on all tables in schema public to service_role;
revoke all on all tables in schema public from anon, authenticated;
