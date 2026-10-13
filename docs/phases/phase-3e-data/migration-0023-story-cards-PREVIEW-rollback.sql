-- PREVIEW ONLY. NOT APPLIED. Rollback for the preview of migration 0023. One transaction.
-- It drops both tables (and with them every story card stored). Export first if any real card exists.
begin;
drop table if exists story_gate_history;
drop table if exists story_cards;
commit;
