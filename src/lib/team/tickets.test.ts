import { describe, expect, it } from "vitest";
import { formatFeedbackCard, parseFeedbackCard, TICKET_TYPES } from "./tickets";

const card = (o: Record<string, unknown> = {}) => ({ ticket: "QUALITY_CORRECTION", from: ["V3"], to: "W1", section: "h1", issue: "The H1 does not name the situation.", severity: "should fix", evidence: "authenticity q3", fix: "Name the hoarded-house situation.", blocking: false, ...o });
const ok = (o?: Record<string, unknown>) => parseFeedbackCard(card(o)).success;

describe("feedback card", () => {
  it("accepts a well-formed card", () => expect(ok()).toBe(true));
  it("accepts a combined V2 + V3 card and renders it", () => {
    const r = parseFeedbackCard(card({ from: ["V2", "V3"] }));
    expect(r.success && formatFeedbackCard(r.data)).toContain("FROM:     V2 + V3 (agreed)");
  });
  it("rejects BLOCKING yes from V2 or V3 (and from a combined card)", () => {
    expect(ok({ from: ["V2"], blocking: true })).toBe(false);
    expect(ok({ from: ["V3"], blocking: true })).toBe(false);
    expect(ok({ from: ["V1", "V2"], blocking: true })).toBe(false);
  });
  it("accepts BLOCKING yes from V1", () => expect(ok({ from: ["V1"], blocking: true, severity: "must fix" })).toBe(true));
  it("rejects a card without evidence, section or issue", () => {
    expect(ok({ evidence: "" })).toBe(false);
    expect(ok({ evidence: undefined })).toBe(false);
    expect(ok({ section: "" })).toBe(false);
    expect(ok({ section: undefined })).toBe(false);
    expect(ok({ issue: "" })).toBe(false);
    expect(ok({ issue: undefined })).toBe(false);
  });
  it("rejects more than one issue in a card", () => {
    expect(ok({ issue: "The H1 is vague.\nThe CTA is missing." })).toBe(false);
    expect(ok({ issue: "1. The H1 is vague. 2. The CTA is missing." })).toBe(false);
  });
  it("rejects unknown ticket types, unknown roles, unknown severities and extra keys", () => {
    expect(ok({ ticket: "STRATEGY_CHALLENGE" })).toBe(false);
    expect(ok({ ticket: "ARCHITECTURE_REVISION" })).toBe(false);
    expect(ok({ ticket: "NOPE" })).toBe(false);
    expect(ok({ from: ["V9"] })).toBe(false);
    expect(ok({ severity: "critical" })).toBe(false);
    expect(ok({ locked: true })).toBe(false);
    expect(ok({ state: "APPROVED" })).toBe(false);
  });
  it("routes each type to its own team", () => {
    expect(ok({ ticket: "EVIDENCE_REQUEST", from: ["V1"], to: "R1" })).toBe(true);
    expect(ok({ ticket: "EVIDENCE_REQUEST", to: "W1" })).toBe(false);
    expect(ok({ ticket: "ROOT_CAUSE_NOTE", from: ["V2"], to: "S2" })).toBe(true);
    expect(ok({ ticket: "ROOT_CAUSE_NOTE", from: ["V2"], to: "W1" })).toBe(false);
    expect(ok({ ticket: "HUMAN_ESCALATION", from: ["W1"], to: "LEO" })).toBe(true);
    expect(ok({ ticket: "HUMAN_ESCALATION", from: ["W1"], to: "S1" })).toBe(false);
    expect(ok({ to: "LEO" })).toBe(false);
    expect(ok({ to: "W2" })).toBe(false);   // QUALITY_CORRECTION goes to W1 only
  });
  it("an escalation card may name its trigger; no other ticket type may", () => {
    expect(ok({ ticket: "HUMAN_ESCALATION", from: ["W1"], to: "LEO", trigger: "legal_uncertain" })).toBe(true);
    expect(ok({ ticket: "HUMAN_ESCALATION", from: ["W1"], to: "LEO", trigger: "made_up" })).toBe(false);
    expect(ok({ trigger: "legal_uncertain" })).toBe(false);
  });
  it("rejects a ticket addressed to its sender", () => expect(ok({ from: ["W1"], to: "W1" })).toBe(false));
  it("knows exactly the four starting ticket types", () => expect([...TICKET_TYPES]).toEqual(["EVIDENCE_REQUEST", "ROOT_CAUSE_NOTE", "QUALITY_CORRECTION", "HUMAN_ESCALATION"]));
});
