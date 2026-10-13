-- PREVIEW ONLY. Rollback for the preview of migration 0022 (image card fields).
begin;
alter table image_cards drop constraint if exists image_cards_prompt_present;
alter table image_cards drop column if exists avoid;
alter table image_cards drop column if exists generation_prompt;
alter table image_cards rename column text_overlay to image_text;
commit;
