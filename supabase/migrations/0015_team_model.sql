-- Phase 3c: team model. Tickets between teams, their messages, per-article team runs, and the classic/team switch.
-- RLS forced, no policies (as 0012). Existing articles stay 'classic'. The Studio never writes to WordPress.

alter table articles add column if not exists pipeline_mode text not null default 'classic' check (pipeline_mode in ('classic','team'));
-- A team-mode branch of an article (the comparison run) points at the classic article it was copied from. The original is never changed.
alter table articles add column if not exists branch_of uuid references articles(id);

create table team_runs (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id),
  mode text not null default 'team' check (mode in ('team')),
  ticket_budget integer not null default 10,
  round_limit integer not null default 2,
  budget_used integer not null default 0,
  status text not null default 'RUNNING' check (status in ('RUNNING','COMPLETE','STOPPED_BUDGET','ESCALATED')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index team_runs_article on team_runs (article_id);

create table tickets (
  id uuid primary key default gen_random_uuid(),
  team_run_id uuid not null references team_runs(id),
  article_id uuid not null references articles(id),
  unit_key text,                                   -- section key (s1, faq, h1 ...) the ticket is about
  ticket_type text not null check (ticket_type in ('EVIDENCE_REQUEST','ROOT_CAUSE_NOTE','QUALITY_CORRECTION','HUMAN_ESCALATION')),
  from_role text not null check (from_role in ('R1','R2','R3','S1','S2','W1','W2','V1','V2','V3','ORCHESTRATOR','LEO')),
  to_role text not null check (to_role in ('R1','R2','R3','S1','S2','W1','W2','V1','V2','V3','LEO')),
  issue text not null,                             -- one issue per ticket
  severity text not null default 'should fix' check (severity in ('must fix','should fix','suggestion')),
  evidence text,                                   -- query / rule / source id
  suggested_fix text,
  blocking boolean not null default false,         -- only V1 may block
  status text not null default 'OPEN' check (status in ('OPEN','ANSWERED','CLOSED','ESCALATED')),
  round integer not null default 1,
  parent_ticket_id uuid references tickets(id),
  version_hash text,                               -- the draft version the ticket was raised against
  resolution text,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint only_v1_blocks check (blocking = false or from_role = 'V1'),
  constraint no_self_ticket check (from_role <> to_role)
);
create index tickets_article on tickets (article_id, status);
create index tickets_run on tickets (team_run_id);

create table ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id),
  role text not null,
  body text not null,
  round integer not null default 1,
  version_hash text,
  agent_run_id uuid references agent_runs(id),
  created_at timestamptz not null default now()
);
create index ticket_messages_ticket on ticket_messages (ticket_id, created_at);

alter table team_runs enable row level security; alter table team_runs force row level security;
alter table tickets enable row level security; alter table tickets force row level security;
alter table ticket_messages enable row level security; alter table ticket_messages force row level security;

grant all on all tables in schema public to service_role;
revoke all on all tables in schema public from anon, authenticated;
