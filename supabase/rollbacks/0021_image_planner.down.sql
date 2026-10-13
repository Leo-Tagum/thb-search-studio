-- Rollback for migration 0021 (image planner). One transaction: all or nothing.
-- Safe only while the three tables and the bucket are empty; if images were uploaded, export them first.
-- The bucket delete fails by design while the bucket still holds files, and then the whole rollback is undone.
begin;
drop table if exists image_uploads;
drop table if exists image_cards;
drop table if exists image_plans;
delete from storage.buckets where id = 'article-images';
commit;
