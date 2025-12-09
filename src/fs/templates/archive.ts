// Archive.md template
import type { ProjectDefinition } from '../../core/project/types.ts'
import { generateBaseFrontmatter } from './frontmatter.ts'

export function generateArchive(project: ProjectDefinition): string {
  const frontmatter = generateBaseFrontmatter(project, {
    extraFields: {
      archive_version: 1,
    },
  })

  return `${frontmatter}
# Archive – ${project.name}

> Retired milestones, abandoned directions, and old notes live here.

---

## 1. Retired Milestones

<!-- Move completed or abandoned milestones here -->

### Milestone X – (Name) (Retired)

**Why retired:**
…

**What I keep from it:**
…

---

## 2. Abandoned Ideas

<!-- Ideas that were explored but didn't work out -->

- Idea: (none yet)
  - Why I parked it: …

---

## 3. Old Logs / Notes

<!-- Historical notes that are no longer relevant to active work -->

- …
`
}
