-- Rollback of 0020_legal_claim_verification.sql. Not applied by `npm run db:migrate` (it lives in supabase/rollbacks/).
-- Run by hand, once, only if 0020 must be undone. Data in these columns is lost; the claims themselves (text, source, risk, support) are untouched.
begin;
alter table escalations drop column if exists reference_needed;
alter table claims drop constraint if exists claims_reader_impact_check;
alter table claims drop constraint if exists claims_verification_label_check;
alter table claims drop column if exists reader_impact;
alter table claims drop column if exists gates;
alter table claims drop column if exists verified_against;
alter table claims drop column if exists verification_reason;
alter table claims drop column if exists verification_label;
alter table claims drop column if exists section_cite;
alter table claims drop column if exists quote_full;
delete from schema_migrations where name = '0020_legal_claim_verification.sql';
commit;
