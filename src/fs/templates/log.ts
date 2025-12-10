// Log.md template
import type { ProjectDefinition } from '../../core/project/types.ts'
import { generateBaseFrontmatter } from './frontmatter.ts'
import { todayDate } from '../../core/project/types.ts'

export function generateLog(project: ProjectDefinition): string {
  const frontmatter = generateBaseFrontmatter(project, {
    extraFields: {
      log_version: 1,
    },
  })

  const date = todayDate()

  // Build session summary from session log
const whatHappened =
  project.sessionLog.length > 0
    ? project.sessionLog
        .slice(0, 5)
        .map(
          (entry) =>
            `- **${entry.phase}:** ${entry.question.slice(0, 50)}...`,
        )
        .join('\n')
    : '- Initial project creation via Lachesis'

  const decisions =
    [
      project.vision.oneLinePitch
        ? `- Defined project pitch: "${project.vision.oneLinePitch}"`
        : null,
      project.vision.primaryAudience
        ? `- Identified primary audience: ${project.vision.primaryAudience}`
        : null,
      project.solution.approach
        ? `- Established approach: ${project.solution.approach.slice(0, 80)}...`
        : null,
    ]
      .filter(Boolean)
      .join('\n') || '- (captured during the planning conversation)'

  const nextSteps =
    [
      project.execution.firstMove,
      project.execution.secondMove,
      project.execution.thirdMove,
    ]
      .filter(Boolean)
      .map((s) => `- ${s}`)
      .join('\n') || '- (to be defined)'

  return `${frontmatter}
# Log – ${project.name}

> Chronological history: sessions, decisions, pivots.

---

## ${date} – Creation Session

**Context:**
First \`lachesis new\` planning session. Project created from ${project.setup.planningLevel.replace('_', ' ')} conversation.

**What happened:**
${whatHappened}

**Decisions made:**
${decisions}

**Next steps (copied into Roadmap):**
${nextSteps}

---

<!-- Future sessions go here -->

## YYYY-MM-DD – Work Session

**Focus:**
…

**What I actually did:**
- …

**New decisions:**
- …

**Changes to roadmap/overview:**
- …

---
`
}
