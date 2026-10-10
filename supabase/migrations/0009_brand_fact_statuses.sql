-- Brand facts imported from the Brand Consistency Project artifact (read-only source).
-- approved = use; sourced = use exact wording only (usage_rule says how); pending_juan = blocked until Juan decides.
alter table brand_facts drop constraint if exists brand_facts_status_check;
alter table brand_facts add constraint brand_facts_status_check check (status in ('proposed','approved','conflict','needed','sourced','pending_juan'));
alter table brand_facts add column if not exists usage_rule text;
grant all on all tables in schema public to service_role;
revoke all on all tables in schema public from anon, authenticated;
