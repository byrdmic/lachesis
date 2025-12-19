// Project scaffolder - creates the project directory and files
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { readTemplate, type TemplateName } from './templates/index.ts'
import type { ExtractedProjectData } from '../ai/client.ts'

export type ScaffoldResult =
  | { success: true; projectPath: string }
  | { success: false; error: string }

/**
 * Project data for scaffolding - combines extracted data with naming info
 */
export type ScaffoldProjectData = {
  projectName: string
  projectSlug: string
  oneLiner?: string
  extracted?: ExtractedProjectData
}

/**
 * Checks if the extracted project data is minimal/sparse.
 * Returns true if the user provided very little information during discovery.
 */
function hasMinimalExtractedData(data: ScaffoldProjectData): boolean {
  if (!data.extracted) return true

  const { vision, constraints } = data.extracted

  // Count filled fields in vision (required for a well-defined project)
  let filledCount = 0
  if (vision.oneLinePitch && vision.oneLinePitch.length > 10) filledCount++
  if (vision.description && vision.description.length > 20) filledCount++
  if (vision.primaryAudience && vision.primaryAudience.length > 5) filledCount++
  if (vision.problemSolved && vision.problemSolved.length > 10) filledCount++

  // If we have 2 or fewer filled vision fields, it's minimal
  if (filledCount <= 2) return true

  // Also check if constraints are empty
  const hasConstraints = constraints.known && constraints.known.length > 0
  const hasAntiGoals = constraints.antiGoals && constraints.antiGoals.length > 0

  // If no constraints and no anti-goals, still somewhat minimal
  if (!hasConstraints && !hasAntiGoals && filledCount <= 3) return true

  return false
}

/**
 * Process a template: fill in known values, strip placeholder markers for unknown values.
 * NEVER leave raw <placeholder> markers in the output.
 */
function processTemplate(
  template: string,
  templateName: TemplateName,
  data: ScaffoldProjectData,
): string {
  let content = template
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10)
  const projectId = `${dateStr.replace(/-/g, '')}-${data.projectSlug.toLowerCase().slice(0, 12)}`

  // === FRONTMATTER REPLACEMENTS ===
  // Replace project identifiers in YAML frontmatter
  content = content.replace(/"<Project Name>"/g, `"${data.projectName}"`)
  content = content.replace(/"<Short Codename>"/g, `"${data.projectSlug}"`)
  content = content.replace(/"<YYYYMMDD-shortslug>"/g, `"${projectId}"`)

  // === MARKDOWN TITLE REPLACEMENTS ===
  // Replace titles like "# Overview — <Project Name>"
  content = content.replace(/— <Project Name>/g, `— ${data.projectName}`)

  // === CONTENT REPLACEMENTS (Overview.md specific) ===
  if (templateName === 'overview' && data.extracted) {
    const v = data.extracted.vision
    const c = data.extracted.constraints
    const e = data.extracted.execution

    // Elevator pitch
    if (v.oneLinePitch || v.description) {
      content = content.replace(
        /<What are you building, for whom, and why does it matter\?>/g,
        v.description || v.oneLinePitch,
      )
    }

    // Problem statement
    if (v.problemSolved) {
      content = content.replace(/<What hurts today\?>/g, v.problemSolved)
    }

    // Target users
    if (v.primaryAudience) {
      content = content.replace(/<Who\?>/g, v.primaryAudience)
    }
    if (v.secondaryAudience) {
      // Add secondary audience info if available
      content = content.replace(
        /- \*\*Primary user\(s\):\*\* .*/,
        `- **Primary user(s):** ${v.primaryAudience}\n- **Secondary user(s):** ${v.secondaryAudience}`,
      )
    }

    // Anti-goals / Out of scope
    if (c.antiGoals && c.antiGoals.length > 0) {
      const antiGoalBullets = c.antiGoals.map((g) => `- ${g}`).join('\n')
      content = content.replace(
        /### Out-of-Scope \(Anti-Goals\)\n- <Bullets>/,
        `### Out-of-Scope (Anti-Goals)\n${antiGoalBullets}`,
      )
    }

    // Constraints
    if (c.known && c.known.length > 0) {
      // Try to categorize constraints
      const constraintBullets = c.known.map((k) => `- ${k}`).join('\n')
      content = content.replace(
        /## Constraints\n- \*\*Time:\*\* <deadlines, cadence>\n- \*\*Tech:\*\* <stack constraints, hosting constraints>\n- \*\*Money:\*\* <budget or "as close to \$0 as possible">\n- \*\*Operational:\*\* <privacy, local-first, offline, etc.>/,
        `## Constraints\n${constraintBullets}`,
      )
    }

    // Tech stack in constraints or elsewhere
    if (e.techStack) {
      content = content.replace(/<stack constraints, hosting constraints>/g, e.techStack)
    }

    // First move / suggested first move
    if (e.suggestedFirstMove) {
      // Could add to roadmap or tasks - for now, add to Log.md if we're processing that
    }
  }

  // === ROADMAP SPECIFIC ===
  if (templateName === 'roadmap') {
    const isMinimal = hasMinimalExtractedData(data)

    if (isMinimal) {
      // For minimal scaffolds, add "Define the project" as M1
      content = content.replace(/M1 — <Milestone title>/g, 'M1 — Define the Project')
      content = content.replace(/M2 — <Milestone title>/g, 'M2 — Initial Setup')

      // Update the M1 milestone section with definition-focused content
      content = content.replace(
        /### M1 — <Milestone Title>\n\*\*Status:\*\* planned.*?(?=---|\n###|\n## |$)/s,
        `### M1 — Define the Project
**Status:** active
**Why it matters:** Without a clear project definition, execution will drift.
**Outcome:** Overview.md, Roadmap.md, and Tasks.md have enough content for Lachesis to operate.

**Definition of Done (observable)**
- Overview.md: Elevator pitch filled in with real content
- Overview.md: Problem statement describes actual pain point
- Overview.md: Target users identified
- Roadmap.md: At least one concrete milestone beyond this one
- Tasks.md: At least 3 actionable next steps

**Links**
- Tasks slice: [[Tasks#VS1 — Project Definition]]

---

`,
      )
    } else {
      // Normal scaffold with sufficient data
      content = content.replace(/M1 — <Milestone title>/g, 'M1 — Initial Setup')
      content = content.replace(/M2 — <Milestone title>/g, 'M2 — Core Features')
    }

    content = content.replace(/<Milestone Title>/g, 'TBD')
    content = content.replace(/<Slice name>/g, 'Initial slice')
    content = content.replace(/<One sentence. "We're trying to…">/g, '')
    content = content.replace(
      /<What we are trying to accomplish right now in plain English.>/g,
      '',
    )
  }

  // === TASKS SPECIFIC ===
  if (templateName === 'tasks') {
    const isMinimal = hasMinimalExtractedData(data)

    if (isMinimal) {
      // For minimal scaffolds, add project definition tasks
      content = content.replace(/<Slice Name>/g, 'Project Definition')
      content = content.replace(
        /<End-to-end capability you can demo>/g,
        'Project has enough definition for Lachesis to assist',
      )
      content = content.replace(
        /<Value \/ milestone alignment>/g,
        'Aligns with M1 — Define the Project',
      )

      // Replace the placeholder tasks with project definition tasks
      content = content.replace(
        /\*\*Tasks\*\*\n- \[ \] VS1-T1 <Verb \+ object>.*?(?=---|\n## |$)/s,
        `**Tasks**
- [ ] VS1-T1 Write elevator pitch in Overview.md
  - Acceptance: One clear sentence describing what this is and who it's for
- [ ] VS1-T2 Define the problem being solved
  - Acceptance: Problem statement in Overview.md explains what hurts today
- [ ] VS1-T3 Identify target users
  - Acceptance: Primary users section in Overview.md has real people/roles
- [ ] VS1-T4 Add first concrete milestone to Roadmap.md
  - Acceptance: M2 has a clear outcome and definition of done
- [ ] VS1-T5 Update Next 1-3 Actions with real tasks
  - Acceptance: Actions section has specific, timeboxed work items

`,
      )
    } else {
      content = content.replace(/<Slice Name>/g, 'Initial Tasks')
      content = content.replace(/<End-to-end capability you can demo>/g, '')
      content = content.replace(/<Value \/ milestone alignment>/g, '')
    }
  }

  // === LOG SPECIFIC ===
  if (templateName === 'log') {
    // Add initial entry with project creation
    const timestamp = today.toTimeString().slice(0, 5)
    content = content.replace(
      /<Write whatever you want here. No structure required.>/,
      `## ${dateStr}\n### ${timestamp} — Project created\nProject scaffolded via Lachesis.${data.oneLiner ? `\n\n**One-liner:** ${data.oneLiner}` : ''}`,
    )
  }

  // === IDEAS SPECIFIC ===
  if (templateName === 'ideas') {
    // Just clean up placeholders
  }

  // === FINAL CLEANUP: Strip all remaining <placeholder> markers ===
  // Replace any remaining <...> placeholders with empty string
  // Be careful to not strip legitimate content like HTML tags (shouldn't be any in markdown)
  // Match: < followed by text without < or > and optional spaces, followed by >
  content = content.replace(/<[^<>]+>/g, '')

  // Clean up empty bullet points that result from stripped placeholders
  // "- " followed by only whitespace/newline becomes empty
  content = content.replace(/^- \s*$/gm, '')

  // Clean up multiple consecutive empty lines (more than 2)
  content = content.replace(/\n{3,}/g, '\n\n')

  return content
}

/**
 * Scaffold a new project in the vault
 */
export async function scaffoldProject(
  vaultPath: string,
  projectSlug: string,
  projectData?: ScaffoldProjectData,
): Promise<ScaffoldResult> {
  try {
    // Validate vault path
    if (!vaultPath || vaultPath.trim() === '') {
      return {
        success: false,
        error:
          'Vault path is not configured. Please update ~/.lachesis/config.json',
      }
    }

    // Create vault path if it doesn't exist
    if (!existsSync(vaultPath)) {
      mkdirSync(vaultPath, { recursive: true })
    }

    // Create project directory
    const projectPath = join(vaultPath, projectSlug)

    if (existsSync(projectPath)) {
      return {
        success: false,
        error: `Project directory already exists: ${projectPath}`,
      }
    }

    mkdirSync(projectPath, { recursive: true })

    // Default project data if not provided
    const data: ScaffoldProjectData = projectData ?? {
      projectName: projectSlug,
      projectSlug,
    }

    // Copy all static templates, processing them to fill in data and strip placeholders
    const files: Array<{ dest: string; template: TemplateName }> = [
      { dest: join(projectPath, 'Overview.md'), template: 'overview' },
      { dest: join(projectPath, 'Roadmap.md'), template: 'roadmap' },
      { dest: join(projectPath, 'Tasks.md'), template: 'tasks' },
      { dest: join(projectPath, 'Log.md'), template: 'log' },
      { dest: join(projectPath, 'Ideas.md'), template: 'ideas' },
      { dest: join(projectPath, 'Archive.md'), template: 'archive' },
    ]

    // Write all files with processed content
    for (const file of files) {
      const rawTemplate = readTemplate(file.template)
      const processedContent = processTemplate(rawTemplate, file.template, data)
      writeFileSync(file.dest, processedContent, 'utf-8')
    }

    return { success: true, projectPath }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { success: false, error }
  }
}

/**
 * Check if a project with the given slug already exists
 */
export function projectExists(vaultPath: string, slug: string): boolean {
  const projectPath = join(vaultPath, slug)
  return existsSync(projectPath)
}
