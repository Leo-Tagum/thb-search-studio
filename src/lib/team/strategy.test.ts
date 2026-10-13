import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newRouter, raiseTicket } from "./router";
import { briefSchema, resolveRootCause, type ApprovedIdentity, type Brief } from "./strategy";

const row = (r: string) => ({ row: r, status: "answered", answer: `answer for ${r}`, basis: "seller_problem_logic", claim_ids: [] });
const brief = (): Brief => briefSchema.parse({
  seller_situation_map: ["ownership", "authority", "condition", "people", "money", "timing", "risk"].map(row),
  honest_options: [{ option: "keep_it", when_it_fits: "when you can wait", claim_ids: [] }, { option: "list_it", when_it_fits: "when repairs are done", claim_ids: [] }, { option: "sell_directly", when_it_fits: "when time matters", claim_ids: [] }],
  real_world_warnings: [{ warning: "Piles can hide damage that delays escrow.", claim_ids: [] }],
  professional_confirmation: ["attorney", "title company"],
  working_title: "Selling a Hoarded House in the Bay Area", target_reader: "an heir or owner of a packed house", answer_first: "You can sell a hoarded house as-is.",
  outline: [{ h2: "Can you sell a hoarded house?", purpose: "Direct answer", claim_ids: [] }, { h2: "What must you disclose?", purpose: "Disclosure", claim_ids: ["clm:1"] }, { h2: "What does cleanup cost?", purpose: "Cost", claim_ids: [] }],
  fan_out: [], visuals: [], link_plan: [{ to_url: "https://www.twinhomebuyer.com/hoarder-houses/", anchor_intent: "hoarder house sale options" }, { to_url: "https://www.twinhomebuyer.com/sell-my-house-fast/", anchor_intent: "money page next step" }], cta: "Call for a no-pressure look.", open_items: [],
});
const MONEY = "https://www.twinhomebuyer.com/sell-my-house-fast/";
const approved: ApprovedIdentity = { brief: brief(), keyword: "hoarded house", slug: "selling-a-hoarded-house", action: "CREATE", targetPage: null, requiredLinks: ["https://www.twinhomebuyer.com/hoarder-houses/"], forbiddenTargetPhrases: ["we buy houses", "cash for houses"], protectedUrls: [MONEY] };
const ticket = { id: "T1", type: "ROOT_CAUSE_NOTE", to: "S2", unitKey: "s3" };
const supported = new Set(["clm:1", "clm:2"]);
const result = (over: (b: Brief) => void, extra: Record<string, unknown> = {}) => {
  const b = brief();
  over(b);
  return { ticket_id: "T1", root_cause: "The brief gave this section the wrong purpose.", target_keyword: "hoarded house", slug: "selling-a-hoarded-house", action: "CREATE", target_page: null, brief: b, affected_units: [], tickets: [], ...extra };
};
const run = (output: unknown, t = ticket) => resolveRootCause({ ticket: t, approved, output, supportedClaimIds: supported });

describe("ROOT_CAUSE_NOTE yields a brief revision that lists the affected units", () => {
  it("a purpose change in one section revises the brief and affects only that unit", () => {
    const o = run(result((b) => { b.outline[2].purpose = "Cost ranges and who pays"; }, { affected_units: [{ unit_key: "s3", reason: "its purpose changed" }] }));
    expect(o).toMatchObject({ kind: "revise", affectedUnits: ["s3"], globalChanges: [] });
  });
  it("code computes the affected set: a missed unit is refused, and so is a unit the change does not touch", () => {
    const miss = run(result((b) => { b.outline[1].purpose = "x purpose"; b.outline[2].purpose = "y purpose"; }, { affected_units: [{ unit_key: "s3", reason: "changed" }] }));
    expect(miss.kind === "invalid" && miss.errors.join()).toMatch(/touches s2/);
    const extra = run(result((b) => { b.outline[2].purpose = "y purpose"; }, { affected_units: [{ unit_key: "s3", reason: "changed" }, { unit_key: "faq", reason: "just in case" }] }));
    expect(extra.kind === "invalid" && extra.errors.join()).toMatch(/faq is listed as affected but the change does not touch it/);
  });
  it("a revision must name its affected units, and only real units", () => {
    expect(run(result((b) => { b.outline[0].notes = "lead with the pile"; })).kind).toBe("invalid");
    const bad = run(result((b) => { b.outline[0].notes = "lead with the pile"; }, { affected_units: [{ unit_key: "s9", reason: "nope nope" }] }));
    expect(bad.kind === "invalid" && bad.errors.join()).toMatch(/not a unit of this article/);
  });
  it("an answer-first change affects s1; a global change (CTA) lets S2 name the units it touches", () => {
    expect(run(result((b) => { b.answer_first = "Yes, and here is how it works."; }, { affected_units: [{ unit_key: "s1", reason: "answer plan changed" }] })).kind).toBe("revise");
    expect(run(result((b) => { b.answer_first = "Yes, and here is how it works."; }, { affected_units: [{ unit_key: "s2", reason: "wrong unit here" }] })).kind).toBe("invalid");
    const g = run(result((b) => { b.cta = "Ask us for a clear, no-pressure offer."; }, { affected_units: [{ unit_key: "s3", reason: "closing CTA is in this section" }, { unit_key: "faq", reason: "FAQ repeats the CTA" }] }));
    expect(g).toMatchObject({ kind: "revise", affectedUnits: ["s3", "faq"], globalChanges: ["cta"] });
  });
  it("when the brief is not the cause, nothing changes and no units are affected", () => {
    expect(run(result(() => {}))).toMatchObject({ kind: "no_brief_change" });
    expect(run(result(() => {}, { affected_units: [{ unit_key: "s3", reason: "should not be listed" }] })).kind).toBe("invalid");
  });
  it("the revised brief may cite only supported ledger claims", () => {
    const o = run(result((b) => { b.outline[2].claim_ids = ["clm:99"]; }, { affected_units: [{ unit_key: "s3", reason: "cites a claim" }] }));
    expect(o.kind === "invalid" && o.errors.join()).toMatch(/clm:99/);
  });
  it("wrong ticket, wrong ticket_id, malformed output and tickets S2 may not raise are refused", () => {
    expect(run(result(() => {}), { ...ticket, type: "QUALITY_CORRECTION" }).kind).toBe("invalid");
    expect(run(result(() => {}), { ...ticket, to: "W1" }).kind).toBe("invalid");
    expect(run(result(() => {}, { ticket_id: "T9" })).kind).toBe("invalid");
    expect(run({ nonsense: true }).kind).toBe("invalid");
    expect(run(result(() => {}, { approved: true })).kind).toBe("invalid");
    const card = { ticket: "ROOT_CAUSE_NOTE", from: ["S2"], to: "S1", section: "s3", issue: "Not allowed here.", severity: "should fix", evidence: "x y z", fix: null, blocking: false };
    expect(run(result(() => {}, { tickets: [card] })).kind).toBe("invalid");
  });
});

describe("a change to the approved brief or target keyword escalates", () => {
  it("a keyword change escalates to Leo and is not applied", () => {
    const o = run(result(() => {}, { target_keyword: "cluttered house" }));
    expect(o).toMatchObject({ kind: "escalate", trigger: "brief_change" });
    expect(o.kind === "escalate" && o.changed[0]).toMatch(/target keyword "hoarded house" -> "cluttered house"/);
  });
  it("a changed H2, a reordered outline, an added section or a new working title escalates", () => {
    expect(run(result((b) => { b.outline[1].h2 = "What do you owe buyers?"; })).kind).toBe("escalate");
    expect(run(result((b) => { b.outline.reverse(); })).kind).toBe("escalate");
    expect(run(result((b) => { b.outline.push({ h2: "A new question?", purpose: "More", claim_ids: [] }); })).kind).toBe("escalate");
    expect(run(result((b) => { b.working_title = "A Different Title"; })).kind).toBe("escalate");
  });
  const esc = (o: ReturnType<typeof run>) => (o.kind === "escalate" ? o.changed.join(" | ") : `NOT ESCALATED: ${o.kind}`);
  it("a changed slug/URL escalates; a trailing slash or case difference does not", () => {
    expect(esc(run(result(() => {}, { slug: "hoarder-house-sale" })))).toMatch(/slug\/URL "selling-a-hoarded-house" -> "hoarder-house-sale"/);
    expect(run(result(() => {}, { slug: "/Selling-A-Hoarded-House/" })).kind).toBe("no_brief_change");
  });
  it("a changed action or target page escalates", () => {
    expect(esc(run(result(() => {}, { action: "UPDATE", target_page: "https://www.twinhomebuyer.com/hoarder-houses/" })))).toMatch(/action CREATE -> UPDATE.*target page/);
    expect(esc(run(result(() => {}, { target_page: "https://www.twinhomebuyer.com/other/" })))).toMatch(/target page/);
  });
  it("dropping or replacing the required /hoarder-houses/ link escalates, even by a change that looks harmless", () => {
    expect(esc(run(result((b) => { b.link_plan = b.link_plan.filter((l) => !l.to_url.includes("hoarder-houses")); }, { affected_units: [{ unit_key: "s3", reason: "link moved" }] })))).toMatch(/required link .*hoarder-houses/);
    expect(esc(run(result((b) => { b.link_plan[0].to_url = "https://www.twinhomebuyer.com/hoarder-houses-2/"; })))).toMatch(/required link/);
    expect(run(result((b) => { b.link_plan[0].to_url = "https://www.twinhomebuyer.com/hoarder-houses"; b.link_plan[0].anchor_intent = "options for a packed house"; }, { affected_units: [{ unit_key: "s3", reason: "anchor reworded" }] })).kind).toBe("revise");
  });
  it("a brief that starts aiming at a never-target keyword escalates; one that already mentioned it does not", () => {
    expect(esc(run(result((b) => { b.outline[2].purpose = "Explain why we buy houses for cash"; })))).toMatch(/never-target keyword/);
    expect(esc(run(result((b) => { b.working_title = "Selling a Hoarded House in the Bay Area"; b.cta = "Cash for houses, fast"; })))).toMatch(/cash for houses/);
    expect(run(result((b) => { b.open_items = ["Do not target we buy houses terms"]; }, { affected_units: [{ unit_key: "s3", reason: "note added" }] })).kind).toBe("revise");   // open items are not targeting text
  });
  it("starting or stopping a reference to a protected / money page escalates", () => {
    expect(esc(run(result((b) => { b.outline[2].notes = `Send readers to ${MONEY} for a quote.`; })))).toMatch(/protected \/ money page/);
    expect(esc(run(result((b) => { b.link_plan = b.link_plan.filter((l) => l.to_url !== MONEY); })))).toMatch(/protected \/ money page/);
    expect(esc(run(result((b) => { b.open_items = [`Edit the copy on ${MONEY}`]; })))).toMatch(/protected \/ money page/);
  });
  it("all other fields stay fixable: honest options, warnings, CTA, open items, notes", () => {
    const o = run(result((b) => { b.cta = "Talk to us when you are ready."; b.real_world_warnings.push({ warning: "Bank liens can surface late in escrow.", claim_ids: [] }); b.outline[1].notes = "lead with the form name"; }, { affected_units: [{ unit_key: "s2", reason: "notes changed" }, { unit_key: "s3", reason: "CTA lives here" }] }));
    expect(o.kind).toBe("revise");
  });
  it("a case or spacing change is not a change", () => {
    expect(run(result(() => {}, { target_keyword: "  Hoarded  House " })).kind).toBe("no_brief_change");
  });
  it("the escalation card is a valid HUMAN_ESCALATION that the router accepts", () => {
    const o = run(result(() => {}, { target_keyword: "cluttered house" }));
    if (o.kind !== "escalate") throw new Error("expected escalate");
    const r = raiseTicket(newRouter(), o.card, { at: "2026-10-10T12:00:00Z", versionHash: "v1" }, { trigger: o.trigger });
    expect(r.ok).toBe(true);
    expect(r.ok && r.ticket).toMatchObject({ type: "HUMAN_ESCALATION", to: "LEO", trigger: "brief_change", from: ["S2"] });
  });
});

describe("strategy files", () => {
  const read = (f: string) => readFileSync(`.claude/agents/${f}.md`, "utf8");
  const toolsOf = (t: string) => t.split(/\r?\n/).find((l) => l.startsWith("tools:"));
  it("S1 carries the Agent 1 Prohibited action, 1.4.0, Read/Write only, no web", () => {
    const t = read("thb-s1-strategist");
    expect(t).toMatch(/prompt_version: 1\.4\.0/);
    expect(t).toContain("**Prohibited action: Approving own publication.**");
    expect(toolsOf(t)).toBe("tools: Read, Write");
    expect(t).toMatch(/EVIDENCE_REQUEST/);
    expect(t).toMatch(/UNTRUSTED_DATA/);
  });
  it("S2 carries the Agent 3 Prohibited action, 1.4.0, Read/Write only, and handles ROOT_CAUSE_NOTE without touching the approved identity", () => {
    const t = read("thb-s2-architect");
    expect(t).toMatch(/prompt_version: 1\.4\.0/);
    expect(t).toContain("**Prohibited action: Inventing facts to fill outline gaps.**");
    expect(toolsOf(t)).toBe("tools: Read, Write");
    expect(t).toMatch(/ROOT_CAUSE_NOTE/);
    expect(t).toMatch(/affected_units/);
    expect(t).toMatch(/target keyword, the working title and the H2 questions/);
    expect(t).toMatch(/HUMAN_ESCALATION/);
  });
});
