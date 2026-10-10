"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-server";
import { decideOpportunity, type Choice } from "@/lib/engine/decisions";

const ACTOR = "leo"; // local single-operator app; no login yet (see Phase 1 handoff)

export async function decideAction(formData: FormData) {
  const id = String(formData.get("id"));
  const choice = String(formData.get("choice")) as Choice;
  if (!["approve", "hold_duplication", "hold_evidence", "reject"].includes(choice)) throw new Error("bad choice");
  const res = await decideOpportunity(supabaseAdmin(), id, choice, String(formData.get("reason") ?? ""), ACTOR, { ackProtection: formData.get("ack") === "on" });
  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${id}`);
  redirect(`/opportunities/${id}?${res.ok ? `done=${res.state}` : `error=${encodeURIComponent(res.reason)}`}`);
}
