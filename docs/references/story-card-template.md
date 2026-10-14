# Story card template (Content HQ to the Studio)

A story card is the record you supply; the story text is written only from it (SR-18 to SR-20). **This file is the blank form. A filled card never goes into git, a fixture or a test:** it goes into the private `story_cards` table (migration 0023), and I load it from a file that stays outside the repository.

## How to fill it
- **One fact per line, each in plain words.** A fact is something that happened or was true, written the way you would want it read, not a person's details. If you are not sure a fact is in our records, put `"verified": null`: it is then dropped and never written.
- **`verified`** needs three things for each fact: the record it came from (`record_ref`: where in our transaction records or Content HQ, so someone can find it), who checked it, and the date.
- **Never put in a card:** a name, an address, an exact price or date, a city or neighborhood (unless Juan approved it), or any detail about a person (age, health, family, job, finances). Where a fact needs one of these to make sense, leave it out.
- **`kind`** is one of: `situation` (what the seller was facing), `condition` (the state of the home), `action` (what was done), `outcome` (what happened), `number` (a verified figure).
- A **seller story** uses `situation` facts only until Juan approves process wording (no `action` facts about what we do). A **case study** may use all kinds.
- **Gate** (`green`, `yellow`, `red`, `research_only`): you set it. Yellow means held for the approver (Cherry; Juan may also approve). Only Green is used in an article.
- **Location**: `region` with one of "the Bay Area", "the Peninsula", "the East Bay", "the North Bay", "the South Bay". A city or neighborhood needs `juan_approved_on`.
- **Permission** is `none` unless written seller permission is on file (then `written`, with the document reference). A quote needs written permission and is copied word for word.

## C-29 (decided by Leo, 2026-10-14)
Seller story · Yellow gate · no written permission · region "the Bay Area" only · situation only (no process wording, `process_wording_ids` stays empty). The blank below already has these settings; fill in `source`, `situation_type`, `property_type` (optional), `reader_takeaway` (optional, one sentence, no promise) and the facts.

## The card (copy, fill in, send to me as a file, never paste seller data into git)
```json
{
  "story_id": "C-29",
  "type": "seller_story",
  "source": "<Content HQ reference, for example the row or page where C-29 lives>",
  "gate": { "color": "yellow", "set_by": "Leo", "set_on": "2026-10-14", "from": null, "approval_on": null, "approved_by": null },
  "approval": { "status": "none", "on": null, "by": null },
  "permission": { "status": "none", "doc_ref": null, "on": null },
  "quotes": [],
  "location": { "level": "region", "text": "the Bay Area", "juan_approved_on": null },
  "situation_type": "<the kind of situation in a few words, no person details>",
  "property_type": "<optional: for example single-family home>",
  "reader_takeaway": null,
  "process_wording_ids": [],
  "photos": [],
  "facts": [
    {
      "id": "f1",
      "kind": "situation",
      "text": "<one fact, plain words, no name, no address, no exact price or date, no person detail>",
      "verified": { "record_ref": "<where it is in our records>", "checked_by": "<who checked it>", "checked_on": "YYYY-MM-DD" }
    },
    {
      "id": "f2",
      "kind": "situation",
      "text": "<next fact; set verified to null if it is not verified>",
      "verified": null
    }
  ]
}
```
Add as many facts as the record supports (up to 30), numbered `f1`, `f2`, and so on.

## What happens next (after you send it)
1. I check the card against the schema and the rules of the record (SR-18 to SR-20) with no model involved, and tell you exactly what is wrong, if anything.
2. Only then does it go into the private table. Nothing is written until you say so.
3. The V1 re-run of the 13 FAKE stories happens after the card is in, not before.
4. A Yellow card is held: it cannot be used until the approver's approval is recorded and you change the gate.
