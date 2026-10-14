# Voice Check page for Juan (prepared, NOT published)

Built locally from the real voice reference (read-only from the database): `voice-check-final.html` (7 KB, one page, payload hash `86f828bd…1fec`). Nothing has been published, shared or sent. Juan has not been contacted.

**What it is.** A one-time page for Juan only. He reads the excerpts and the imitate/avoid list and answers: approve, or request changes with a note. It is not an article approval, and Cherry cannot confirm the voice (SR-8, SR-20).

**How you send it (when you decide):**
1. Publish `voice-check-final.html` as a private Artifact with the db and user capabilities (same rules as the Approval Room: viewers write only under `decisions/<their id>/records`). I will do this on your word; I have not.
2. Share the link with Juan only, with edit-level interaction (he must be able to write his own record).
3. He opens it, signs in as himself, and clicks. His record is saved as `decisions/<his id>/records/voice-reference:<hash12>__voice_reference`.
4. I read the records (ArtifactData, read-only) into a `records.json` and run `npm run studio -- sync-voice records.json`.
5. `sync-voice` counts the click only if the account is a confirmed approver labelled Juan (register him once through the same one-click flow: he clicks, you run `confirm-approver`). A click from any other account is stored as feedback and never counts. The recorded decision is the same record shape the Approval Room uses, and it changes the voice reference status only for that exact hash: if the reference text changes later, the old approval no longer covers it.

**Before it goes out:** you look at the local file once more (open it in a browser); nothing in it changes between now and publishing unless the voice reference changes, in which case I rebuild it and the hash changes.
