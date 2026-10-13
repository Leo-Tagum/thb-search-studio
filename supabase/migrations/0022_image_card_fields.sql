-- Migration 0022, approved by Leo 2026-10-14 (reviewed SQL and rollback; rollback in supabase/rollbacks/0022_image_card_fields.down.sql).
-- Migration 0022: the image card fields added at build step 3 and the redesign. Migration 0021 (applied) has image_cards.description and image_cards.image_text
-- and no columns for the example prompt or the avoid list. Renames keep any existing text; the two new columns are NOT NULL with a temporary default so the
-- statement also works on a table that already has rows (today image_plans, image_cards and image_uploads have 0 rows, checked 2026-10-13).
-- One transaction (the runner wraps each file in begin/commit): if any check below fails on existing rows, nothing changes.
-- Access: row-level security stays enabled and forced and the grants of 0021 are unchanged (service role only); the statements at the end restate them (idempotent).
-- The navigation-index migration becomes 0023.

alter table image_cards rename column description to design_brief;         -- "The idea": an art director's brief in plain words (main instruction)
alter table image_cards rename column image_text to text_overlay;          -- the exact words Lawrence adds himself: verbatim lines with source_unit and source_block (existing content kept)
alter table image_cards add column generation_prompt text not null default '';        -- OPTIONAL example prompt for an AI image tool (tool-neutral)
alter table image_cards add column avoid jsonb not null default '[]'::jsonb;          -- the negative prompt: a JSON array of short strings
alter table image_cards alter column generation_prompt drop default;
alter table image_cards alter column avoid drop default;

alter table image_cards add constraint image_cards_design_brief_present check (char_length(btrim(design_brief)) >= 120);
alter table image_cards add constraint image_cards_generation_prompt_present check (char_length(btrim(generation_prompt)) > 0);
alter table image_cards add constraint image_cards_avoid_is_array check (jsonb_typeof(avoid) = 'array' and jsonb_array_length(avoid) >= 6);
alter table image_cards add constraint image_cards_text_overlay_is_array check (jsonb_typeof(text_overlay) = 'array');

-- Access, restated (no change from 0021): RLS on and forced, no policies, service role only.
alter table image_plans enable row level security;   alter table image_plans force row level security;
alter table image_cards enable row level security;   alter table image_cards force row level security;
alter table image_uploads enable row level security; alter table image_uploads force row level security;
revoke all on image_plans, image_cards, image_uploads from anon, authenticated;
grant all on image_plans, image_cards, image_uploads to service_role;
