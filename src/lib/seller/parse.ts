// Parses the seller-library markdown into briefs and passages, classifying each passage.
import { NEVER_STORED, findIssues, type Issue } from "./identity";

export type UseLevel = "FULL" | "SKIP ONE PART" | "BACKGROUND ONLY";
export type Passage = {
  section: string;
  position: number;
  text: string;
  visibility: "publishable" | "internal_only";
  internalReasons: string[];
  notForPublication: boolean;
};
export type Brief = {
  caseId: string;
  title: string;
  useLevel: UseLevel;
  permissionText: string;
  passages: Passage[];
  rejected: { section: string; issue: Issue }[]; // street addresses / names: flagged for Leo, text not stored
};

// Sections that are always internal: neighbourhood detail, "don't write about" notes, permission notes.
const ALWAYS_INTERNAL = new Set(["Property (general)", "Don't write about", "Permission"]);
const KINSHIP = /\b(sister|brother|mother|father|mom|dad|daughter|son|wife|husband|aunt|uncle|cousin)\b/i;
const OCCUPATION = /\b(nurse|teacher|doctor|lawyer|attorney|engineer|retired|works? (?:as|at|for)|broker|realtor|agent|job|occupation|profession|employer)\b/i;
const SHARED_NAME = /\b(?:sharing|shared|share|same) (?:a |the )?first name\b/i;

export function classify(section: string, text: string): { visibility: Passage["visibility"]; reasons: string[] } {
  const reasons: string[] = [];
  if (ALWAYS_INTERNAL.has(section)) reasons.push(`section:${section}`);
  for (const i of findIssues(text)) reasons.push(i.kind);
  if (KINSHIP.test(text) && OCCUPATION.test(text)) reasons.push("family_or_occupation_detail");
  if (SHARED_NAME.test(text)) reasons.push("shared_name_detail");
  const uniq = [...new Set(reasons)];
  return { visibility: uniq.length ? "internal_only" : "publishable", reasons: uniq };
}

const SECTION_LABELS: Record<string, string> = {
  "Property (general):": "Property (general)",
  "Story (from calls):": "Story (from calls)",
  "Worries and how THB handled them:": "Worries and how THB handled them",
  "Permission:": "Permission",
  "Don't write about:": "Don't write about",
};

export function parseLibrary(md: string): Brief[] {
  const blocks = md.split(/^## (?=C-\d+:)/m).slice(1);
  return blocks.map((block) => {
    const lines = block.split(/\r?\n/);
    const head = /^(C-\d+):\s*(.+)$/.exec(lines[0]);
    if (!head) throw new Error(`bad brief heading: ${lines[0].slice(0, 20)}`);
    const levelLine = lines.find((l) => l.startsWith("**Use level:**")) ?? "";
    const level = /\*\*Use level:\*\*\s*(FULL|SKIP ONE PART|BACKGROUND ONLY)/.exec(levelLine)?.[1] as UseLevel | undefined;
    if (!level) throw new Error(`${head[1]}: use level missing`);

    const passages: Passage[] = [];
    const rejected: Brief["rejected"] = [];
    let section = "";
    let pos = 0;
    let permission = "";
    for (const raw of lines.slice(1)) {
      const line = raw.trim();
      if (!line || line.startsWith("**Use level:**")) continue;
      const label = Object.keys(SECTION_LABELS).find((k) => line.startsWith(`**${k}**`));
      let content = line;
      if (label) {
        section = SECTION_LABELS[label];
        content = line.slice(label.length + 4).trim();
        if (!content) continue;
      }
      if (!section) continue;
      content = content.replace(/^[-*]\s+/, "");
      const bad = findIssues(content).filter((i) => NEVER_STORED.includes(i.kind));
      if (bad.length) {
        for (const issue of bad) rejected.push({ section, issue });
        continue; // flagged for Leo; the text is not stored
      }
      const c = classify(section, content);
      if (section === "Permission") permission += (permission ? " " : "") + content;
      passages.push({
        section, position: pos++, text: content, visibility: c.visibility,
        internalReasons: c.reasons, notForPublication: c.visibility === "internal_only",
      });
    }
    return { caseId: head[1], title: head[2].trim(), useLevel: level, permissionText: permission, passages, rejected };
  });
}
