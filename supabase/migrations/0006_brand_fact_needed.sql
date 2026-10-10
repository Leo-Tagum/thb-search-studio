-- 'needed' = a fact the brand set requires but nobody has supplied/approved yet. Never usable in content.
alter table brand_facts drop constraint if exists brand_facts_status_check;
alter table brand_facts add constraint brand_facts_status_check check (status in ('proposed','approved','conflict','needed'));
