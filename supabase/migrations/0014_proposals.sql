-- One proposal = one version of an article (plus, until Juan confirms it, a snapshot of the voice reference) shown in the THB Approval Room.
create table proposals (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id),
  article_version_id uuid not null references article_versions(id),
  voice_snapshot jsonb,                      -- the voice reference as proposed; null once Juan has approved it
  requires_secondary boolean not null default false,   -- privacy exception: needs an independent secondary approver
  status text not null default 'OPEN' check (status in ('OPEN','APPROVED','SENT_BACK','SUPERSEDED')),
  created_by text not null,
  created_at timestamptz not null default now()
);
alter table proposals enable row level security; alter table proposals force row level security;
grant all on all tables in schema public to service_role;
revoke all on all tables in schema public from anon, authenticated;
