-- PREVIEW ONLY. NOT APPLIED. Rollback for the preview of migration 0022. One transaction.
-- Safe at any time: it only drops the two added columns (their contents are lost) and renames text_overlay back to image_text.
begin;
alter table image_cards drop constraint if exists image_cards_text_overlay_is_array;
alter table image_cards drop constraint if exists image_cards_avoid_is_array;
alter table image_cards drop column if exists avoid;
alter table image_cards drop column if exists generation_prompt;
alter table image_cards rename column text_overlay to image_text;
commit;
