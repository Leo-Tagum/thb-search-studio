-- PREVIEW ONLY. NOT APPLIED. Rollback for migration 0021 (image planner). Safe only while the three tables and the bucket are empty; if images
-- were uploaded, export them first (the bucket cannot be dropped while it holds objects).
drop table if exists image_uploads;
drop table if exists image_cards;
drop table if exists image_plans;
delete from storage.buckets where id = 'article-images';   -- fails (by design) if the bucket still holds files
