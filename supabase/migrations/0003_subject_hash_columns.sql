alter table opportunities add column if not exists revision_count integer not null default 0;
alter table opportunities add column if not exists approved_hash text;
alter table articles add column if not exists version_hash text not null default '';
alter table articles add column if not exists approved_hash text;
