-- PREVIEW ONLY. NOT APPLIED. NOT in supabase/migrations. Needs Leo's approval (migrations only with Leo's approval).
-- Build step 3 added three card fields (generation_prompt, avoid, and the rename image_text -> text_overlay). Migration 0021 (applied) has
-- image_cards.image_text and no columns for the other two. Nothing writes to these tables yet (the board runs on fixtures), so the table is empty and
-- this is a plain additive change. Rollback below. The navigation-index migration moves to 0023.
alter table image_cards rename column image_text to text_overlay;
alter table image_cards add column generation_prompt text;
alter table image_cards add column avoid jsonb not null default '[]'::jsonb;
alter table image_cards add constraint image_cards_prompt_present check (generation_prompt is not null) not valid;   -- validated once rows exist; the app schema already requires it
