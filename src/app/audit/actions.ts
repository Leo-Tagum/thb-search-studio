"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-server";
import { bulkApprove, decideAudit, VERDICTS, type Choice, type Verdict } from "@/lib/audit/decisions";

const ACTOR = "leo"; // local single-operator app; no login yet (see Phase 1 handoff)

export async function decideAuditAction(formData: FormData) {
  const id = String(formData.get("id"));
  const kind = String(formData.get("choice"));
  let choice: Choice;
  if (kind === "approve") choice = { kind: "approve" };
  else if (kind === "hold") choice = { kind: "hold" };
  else if (kind === "change") {
    const verdict = String(formData.get("verdict")) as Verdict;
    if (!VERDICTS.includes(verdict)) throw new Error("bad verdict");
    choice = { kind: "change", verdict, targetUrl: String(formData.get("target") ?? "") };
  } else throw new Error("bad choice");
  const res = await decideAudit(supabaseAdmin(), id, choice, String(formData.get("reason") ?? ""), ACTOR, { ackProtection: formData.get("ack") === "on" });
  revalidatePath("/audit"); revalidatePath(`/audit/${id}`); revalidatePath("/audit/actions");
  redirect(`/audit/${id}?${res.ok ? `done=${res.status}` : `error=${encodeURIComponent(res.reason)}`}`);
}

export async function bulkApproveAction(formData: FormData) {
  const ids = formData.getAll("ids").map(String);
  const res = await bulkApprove(supabaseAdmin(), ids, String(formData.get("reason") ?? ""), ACTOR, { ackProtection: formData.get("ack") === "on" });
  revalidatePath("/audit");
  const msg = `Approved ${res.approved}; refused ${res.refused.length}${res.refused[0] ? ` (e.g. ${res.refused[0].reason})` : ""}`;
  redirect(`/audit?msg=${encodeURIComponent(msg)}`);
}
