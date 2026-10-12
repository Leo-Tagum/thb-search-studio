-- Phase 3c: marks throwaway articles created by the live smoke scripts. Only a fixture article accepts the "smoke-test" actor for human actions
-- (resolve a section, switch the pipeline); a real article accepts only "leo". Additive: every existing article stays a real article (false).
alter table articles add column if not exists is_fixture boolean not null default false;
