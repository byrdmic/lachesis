// Overview.md template
import type { ProjectDefinition } from '../../core/project/types.ts'
import { generateBaseFrontmatter } from './frontmatter.ts'
import { todayDate } from '../../core/project/types.ts'

export function generateOverview(project: ProjectDefinition): string {
  const frontmatter = generateBaseFrontmatter(project, {
    extraFields: {
      summary_version: 1,
      primary_domain: 'tbd',
      primary_user: project.vision.primaryAudience || 'tbd',
      impact_level: 'medium',
      last_session_at: project.createdAt,
      last_session_summary: 'Initial project creation via Lachesis',
    },
  })

  const moves = [
    project.execution.firstMove,
    project.execution.secondMove,
    project.execution.thirdMove,
  ].filter(Boolean)

  const nonGoals =
    project.vision.nonGoals.length > 0
      ? project.vision.nonGoals.map((g) => `- ${g}`).join('\n')
      : '- (none defined yet)'

  return `${frontmatter}
# ${project.name}

## 1. Project Snapshot

**One-line pitch:**
> ${project.vision.oneLinePitch || '(to be defined)'}

**What this project is:**
${project.vision.description || project.vision.oneLinePitch || '(to be defined)'}

**Who this is for:**
- Primary audience: ${project.vision.primaryAudience || '(to be defined)'}
${project.vision.secondaryAudience ? `- Secondary audience: ${project.vision.secondaryAudience}` : ''}

**Why this matters (the core pain):**
- ${project.vision.whyItMatters || '(to be defined)'}

---

## 2. Current State

**Status:** \`${project.status}\`
**Release phase:** \`${project.releasePhase}\`
**Current milestone:**
- **Name:** (not yet defined)
- **Short goal:** (not yet defined)

**Right now, this project is…**
Just created. Ready for exploration and first steps.

---

## 3. Next 1–3 Moves (High-Level)

${moves.length > 0 ? moves.map((m, i) => `${i + 1}. **Move ${i + 1}:** ${m}`).join('\n') : '1. **Move 1:** (to be defined)'}

---

## 4. Core Vision

**Longer description:**
${project.solution.approach || '(to be developed)'}

**What makes this different:**
${project.solution.differentiation || '(to be developed)'}

**Non-goals:**
${nonGoals}

---

## 5. Quick Links

- [Roadmap](./Roadmap.md)
- [Log](./Log.md)
- [Idea](./Idea.md)
- [Archive](./Archive.md)
- [Advisor Chat](./AdvisorChat.md)
- [Prompts](./Prompts/)
`
}
