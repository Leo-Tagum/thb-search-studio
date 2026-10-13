-- PREVIEW ONLY. NOT APPLIED. NOT in supabase/migrations. Needs Leo's approval (migrations only with Leo's approval).
-- Migration 0022: the image card fields added at build step 3. Migration 0021 (applied) has image_cards.image_text and no columns for the prompt or the avoid list.
-- image_cards is empty (checked 2026-10-13: 0 rows in image_plans, image_cards, image_uploads) and nothing writes to it yet, so NOT NULL columns are safe.
-- Additive apart from one column rename on an empty table. The navigation-index migration becomes 0023.
alter table image_cards rename column image_text to text_overlay;                 -- the exact words Lawrence adds himself; verbatim lines with source_unit and source_block
alter table image_cards add column generation_prompt text not null;               -- ready-to-paste prompt for an AI image tool (tool-neutral)
alter table image_cards add column avoid jsonb not null;                          -- the negative prompt: a JSON array of short strings (at least 6 in the app schema)
alter table image_cards add constraint image_cards_avoid_is_array check (jsonb_typeof(avoid) = 'array' and jsonb_array_length(avoid) >= 6);
alter table image_cards add constraint image_cards_text_overlay_is_array check (jsonb_typeof(text_overlay) = 'array');
