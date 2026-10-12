-- Phase 3c task 9: a combined council card keeps links to the original V1/V2/V3 cards it came from, so a wrong merge is visible and the originals open on click.
-- The originals are stored as ticket_messages rows; merged_from holds their ids (empty for a ticket that was not merged).
alter table tickets add column if not exists merged_from uuid[] not null default '{}';
