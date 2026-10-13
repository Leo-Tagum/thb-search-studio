-- PREVIEW ONLY. NOT APPLIED. NOT in supabase/migrations. Needs Leo's approval (migrations only with Leo's approval).
-- Migration 0023: the PRIVATE table for story cards (case studies and seller stories; standing rules SR-18 to SR-20). Real story cards live here and NEVER in git, a fixture, a test or a log
-- (this file holds the structure only). Row-level security enabled and forced, no policies, service role only (as 0012 and 0021): anon and authenticated roles have no access at all.
-- The rules of the record are also enforced here, so a row that breaks them cannot be stored: only Leo sets a gate; Yellow becomes Green only with the approver's recorded approval (Cherry or Juan);
-- a quotation needs written seller permission; a city or neighborhood needs Juan's recorded approval. Gate changes are kept in story_gate_history.
-- Additive: nothing existing changes. The navigation-index migration becomes 0024.

create table story_cards (
  id uuid primary key default gen_random_uuid(),
  story_id text not null unique,                                  -- the internal id: never printed in an article
  type text not null check (type in ('case_study','seller_story')),
  gate_color text not null default 'yellow' check (gate_color in ('green','yellow','red','research_only')),
  gate_set_by text not null check (gate_set_by = 'Leo'),          -- only Leo changes a gate (SR-20)
  gate_set_on date not null,
  gate_from text check (gate_from is null or gate_from in ('green','yellow','red','research_only')),
  gate_approval_on date,                                          -- the approver's recorded approval (Yellow -> Green)
  gate_approved_by text check (gate_approved_by is null or gate_approved_by in ('Cherry','Juan')),
  source text not null,                                           -- the Content HQ reference
  approval jsonb not null default '{"status":"none","on":null,"by":null}'::jsonb,         -- the approver's approval of this story's use
  permission jsonb not null default '{"status":"none","doc_ref":null,"on":null}'::jsonb,   -- written seller permission; verbal does not count
  quotes jsonb not null default '[]'::jsonb check (jsonb_typeof(quotes) = 'array'),       -- permitted quotations, word for word
  location jsonb not null default '{"level":"none","text":null,"juan_approved_on":null}'::jsonb,
  facts jsonb not null check (jsonb_typeof(facts) = 'array' and jsonb_array_length(facts) between 1 and 30),   -- [{id, kind, text, verified: {record_ref, checked_by, checked_on} | null}]
  property_type text,
  situation_type text,
  reader_takeaway text,
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  process_wording_ids text[] not null default '{}',               -- Juan-approved process wording (none exists yet)
  created_by text not null default 'leo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_green_from_yellow_needs_approval check (not (gate_color = 'green' and gate_from = 'yellow') or (gate_approval_on is not null and gate_approved_by is not null)),
  constraint story_quotes_need_written_permission check (jsonb_array_length(quotes) = 0 or permission->>'status' = 'written'),
  constraint story_city_needs_juan_approval check (location->>'level' not in ('city','neighborhood') or (location->>'text' is not null and location->>'juan_approved_on' is not null)),
  constraint story_seller_story_has_no_process_facts check (type <> 'seller_story' or not (facts @> '[{"kind":"action"}]'::jsonb or facts @> '[{"kind":"outcome"}]'::jsonb or facts @> '[{"kind":"number"}]'::jsonb))
);

create table story_gate_history (
  id uuid primary key default gen_random_uuid(),
  story_card_id uuid not null references story_cards(id),
  from_color text check (from_color is null or from_color in ('green','yellow','red','research_only')),
  to_color text not null check (to_color in ('green','yellow','red','research_only')),
  changed_by text not null check (changed_by = 'Leo'),
  changed_on date not null,
  approval_on date,
  approved_by text check (approved_by is null or approved_by in ('Cherry','Juan')),
  created_at timestamptz not null default now(),
  constraint story_history_green_from_yellow check (not (to_color = 'green' and from_color = 'yellow') or (approval_on is not null and approved_by is not null))
);
create index story_gate_history_card_idx on story_gate_history(story_card_id);

alter table story_cards enable row level security;        alter table story_cards force row level security;
alter table story_gate_history enable row level security; alter table story_gate_history force row level security;
grant all on story_cards, story_gate_history to service_role;
revoke all on story_cards, story_gate_history from anon, authenticated;
