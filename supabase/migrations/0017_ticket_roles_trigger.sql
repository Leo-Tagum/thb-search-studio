-- Phase 3c task 11: persist the router state exactly. A combined council card is from V2 + V3 (from_role keeps the first, from_roles the full list),
-- and an escalation records which of the six triggers raised it. Additive and nullable: existing rows and the tickets contract are unchanged.
alter table tickets add column if not exists from_roles text[];
alter table tickets add column if not exists escalation_trigger text
  check (escalation_trigger is null or escalation_trigger in ('conflicting_evidence','brief_change','legal_uncertain','round_limit','brand_risk','budget_limit'));
