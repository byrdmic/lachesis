// Roadmap.md template
import type { ProjectDefinition } from "../../core/project/types.ts";
import { generateBaseFrontmatter } from "./frontmatter.ts";

export function generateRoadmap(project: ProjectDefinition): string {
  const frontmatter = generateBaseFrontmatter(project, {
    extraFields: {
      roadmap_version: 1,
    },
  });

  const moves = [
    project.execution.firstMove,
    project.execution.secondMove,
    project.execution.thirdMove,
  ].filter(Boolean);

  const risks = project.constraints.risks.length > 0
    ? project.constraints.risks.map((r) => `- ${r}`).join("\n")
    : "- (none identified yet)";

  const unknowns = project.constraints.derailmentFactors.length > 0
    ? project.constraints.derailmentFactors.map((d) => `- ${d}`).join("\n")
    : "- (none identified yet)";

  const postponed = project.execution.notYet.length > 0
    ? project.execution.notYet.map((n) => `- ${n}`).join("\n")
    : "- (nothing explicitly postponed)";

  return `${frontmatter}
# Roadmap – ${project.name}

## 1. Immediate Next Actions (1–2 weeks)

${moves.length > 0 ? moves.map((m, i) => `${i + 1}. **Action ${i + 1}:** ${m}
   - Why it matters: (to be defined)
   - Blocking on: (nothing yet)`).join("\n\n") : `1. **Action 1:** (to be defined)
   - Why it matters: (to be defined)
   - Blocking on: (nothing yet)`}

---

## 2. Milestones

### Milestone 1 – First Working Version
**Goal:** Get something functional to validate the core idea.
**Target phase:** \`explore\`
**Status:** \`not_started\`

**Key pieces:**
- (to be defined)

**Exit criteria:**
- (to be defined)

---

### Milestone 2 – (Future)
**Goal:** (to be defined)
**Status:** \`not_started\`

**Key pieces:**
- (to be defined)

**Exit criteria:**
- (to be defined)

---

## 3. Risks & Unknowns

**What might derail this:**
${risks}

**Big questions to answer:**
${unknowns}

---

## 4. Long-Term Ideas (beyond current milestones)

${postponed}
`;
}
