-- Phase 2b: new verdict HOLD = only claims waiting on Juan (no change recommended until he decides).
alter table blog_audits drop constraint if exists blog_audits_proposed_verdict_check;
alter table blog_audits add constraint blog_audits_proposed_verdict_check check (proposed_verdict in ('KEEP','UPDATE','MERGE','RETIRE','NOINDEX','FLAG_ONLY','HOLD'));
alter table blog_audits drop constraint if exists blog_audits_final_verdict_check;
alter table blog_audits add constraint blog_audits_final_verdict_check check (final_verdict in ('KEEP','UPDATE','MERGE','RETIRE','NOINDEX','FLAG_ONLY','HOLD'));
grant all on all tables in schema public to service_role;
revoke all on all tables in schema public from anon, authenticated;
