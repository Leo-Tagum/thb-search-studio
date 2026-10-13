-- Phase 3e stage 1: legal-claim verification record ("Legal claims: no guessing", Leo's standing rule, 2026-10-13).
-- Every high-risk legal claim records the exact official quote, the section, how and when it was checked, a MATCH / NARROWER / BROADER / WRONG label,
-- the gates (threshold, exception, alternative decider, scope) the quoted section puts on the rule, and whether an omission changes what a reader
-- would believe or do. Additive and nullable: no existing row changes, no existing query breaks. The rule itself is enforced in code (stages 2 and 3),
-- not by NOT NULL, so older articles keep working until their claims are backfilled.
alter table claims add column if not exists quote_full text;              -- the exact official wording, word for word (no length cap here; the submit check caps new quotes at 1200 characters)
alter table claims add column if not exists section_cite text;            -- section and subsection, e.g. "H&S 17920.3(a)(12)"
alter table claims add column if not exists verification_label text;     -- MATCH | NARROWER | BROADER | WRONG, the claim measured against quote_full
alter table claims add column if not exists verification_reason text;    -- required for NARROWER: why the omission is acceptable (or what was fixed); a note for the others
alter table claims add column if not exists verified_against text;       -- what the quote was read from, e.g. "authenticated leginfo print stored 2026-10-10"
alter table claims add column if not exists gates jsonb not null default '[]'::jsonb;  -- [{kind: threshold|exception|alternative_decider|scope|effective_date, text, stated_in_claim}]
alter table claims add column if not exists reader_impact text;          -- none | changes: does what the claim omits change what a reader would believe or do

alter table claims drop constraint if exists claims_verification_label_check;
alter table claims add constraint claims_verification_label_check
  check (verification_label is null or verification_label in ('MATCH','NARROWER','BROADER','WRONG'));
alter table claims drop constraint if exists claims_reader_impact_check;
alter table claims add constraint claims_reader_impact_check
  check (reader_impact is null or reader_impact in ('none','changes'));

-- "Leo, I need a reference": a verification failure is an escalation with the reference it needs (shown in the Studio and the CLI).
alter table escalations add column if not exists reference_needed jsonb;  -- {claim, section, why} when V1 or Agent 2 cannot verify a legal point from official text
