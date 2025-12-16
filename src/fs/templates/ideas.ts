// Idea.md template
import type { ProjectDefinition } from '../../core/project/types.ts'
import { generateBaseFrontmatter } from './frontmatter.ts'

export function generateIdeas(project: ProjectDefinition): string {
  const frontmatter = generateBaseFrontmatter(project, {
    extraFields: {
      idea_version: 1,
    },
  })

  const excitement = project.solution.excitement
    ? `- ${project.solution.excitement}`
    : '- (captured during planning conversation)'

  const coreLoop = project.solution.coreLoop
    ? `- Core loop/interaction: ${project.solution.coreLoop}`
    : ''

  return `${frontmatter}
# Idea Space – ${project.name}

> Dump raw ideas, variants, and wild directions here.

---

## 1. Big Picture Ideas

${excitement}
${coreLoop}

---

## 2. Feature / Capability Ideas

- Feature: (to be added)
  - Why interesting: …
  - Potential downside: …

---

## 3. Variants / Spin-offs

- Variant: (none yet)
  - …

---

## 4. Parking Lot

> Ideas that don't fit anywhere else yet.

- …
`
}
