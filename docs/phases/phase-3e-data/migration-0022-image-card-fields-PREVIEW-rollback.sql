-- PREVIEW ONLY. NOT APPLIED. Rollback for the preview of migration 0022. One transaction: all or nothing.
-- It drops the two added columns (their contents are lost: the example prompt and the avoid list) and renames the two renamed columns back; the idea and the
-- overlay text are kept under their 0021 names (description, image_text). Access settings are untouched.
begin;
alter table image_cards drop constraint if exists image_cards_text_overlay_is_array;
alter table image_cards drop constraint if exists image_cards_avoid_is_array;
alter table image_cards drop constraint if exists image_cards_generation_prompt_present;
alter table image_cards drop constraint if exists image_cards_design_brief_present;
alter table image_cards drop column if exists avoid;
alter table image_cards drop column if exists generation_prompt;
alter table image_cards rename column text_overlay to image_text;
alter table image_cards rename column design_brief to description;
commit;
