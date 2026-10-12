-- Phase 3c task 12: a ticket keeps the reviewer's issue key, so rework can answer it ("addresses"), a re-report can reopen it (next round),
-- and a fix the reviewers no longer report can close it. Additive and nullable.
alter table tickets add column if not exists issue_key text;
create index if not exists tickets_issue_key on tickets (article_id, unit_key, issue_key);
