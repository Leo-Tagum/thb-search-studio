alter table pages add column if not exists wp_parent integer;
alter table pages add column if not exists path text;
alter table pages add column if not exists rendered_checked_at timestamptz;
