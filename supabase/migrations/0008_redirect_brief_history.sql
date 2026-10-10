-- Phase 2 follow-up: a human can redirect an opportunity (e.g. UPDATE -> CREATE of a separate guide).
-- The redirect directive travels with the opportunity; superseded briefs are kept, not overwritten.
alter table opportunities add column if not exists redirect jsonb;
alter table briefs add column if not exists outline_history jsonb not null default '[]'::jsonb;
grant all on all tables in schema public to service_role;
revoke all on all tables in schema public from anon, authenticated;
