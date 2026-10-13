/* eslint-disable @typescript-eslint/no-explicit-any */
// Writes the Approval Room payload for ONE existing proposal (read-only: no proposal is created or changed), merged with a notes file.
// Usage: npx tsx --env-file=.env.local scripts/approval-room-payload.mts <proposal_id> <notes.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildProposalPayload } from "../src/lib/studio/proposal-payload";

const [proposalId, notesFile, out] = process.argv.slice(2);
if (!proposalId || !notesFile || !out) throw new Error("usage: approval-room-payload.mts <proposal_id> <notes.json> <out.json>");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: p } = await db.from("proposals").select("status").eq("id", proposalId).single();
if (p?.status !== "OPEN") throw new Error(`proposal ${proposalId} is ${p?.status}, not OPEN: not building a room for it`);
const payload: any = await buildProposalPayload(db, proposalId);
payload.notes_for_juan = JSON.parse(readFileSync(notesFile, "utf8"));
writeFileSync(out, JSON.stringify(payload, null, 1));
console.log(`payload for proposal ${proposalId.slice(0, 8)} (article ${payload.article.title.slice(0, 40)}…, state ${payload.article.state}, version ${payload.items[0].hash.slice(0, 12)}) written`);
