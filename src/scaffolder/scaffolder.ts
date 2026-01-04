// Project scaffolder for Obsidian plugin
// Uses Obsidian Vault API instead of Node.js fs

import type { Vault } from 'obsidian'
import { TEMPLATES, type TemplateName } from './templates'
import type { ExtractedProjectData } from '../ai/client'

// ============================================================================
// Types
// ============================================================================

export type ScaffoldResult =
  | { success: true; projectPath: string }
  | { success: false; error: string }

export type ScaffoldProjectData = {
  projectName: string
  projectSlug: string
  oneLiner?: string
  extracted?: ExtractedProjectData
}

// ============================================================================
// Helpers
// ============================================================================

function hasMinimalExtractedData(data: ScaffoldProjectData): boolean {
  if (!data.extracted) return true

  const { vision, constraints } = data.extracted

  let filledCount = 0
  if (vision.oneLinePitch && vision.oneLinePitch.length > 10) filledCount++
  if (vision.description && vision.description.length > 20) filledCount++
  if (vision.primaryAudience && vision.primaryAudience.length > 5) filledCount++
  if (vision.problemSolved && vision.problemSolved.length > 10) filledCount++

  if (filledCount <= 2) return true

  const hasConstraints = constraints.known && constraints.known.length > 0
  const hasAntiGoals = constraints.antiGoals && constraints.antiGoals.length > 0

  if (!hasConstraints && !hasAntiGoals && filledCount <= 3) return true

  return false
}

/**
 * Simplified template processing for creating a single file.
 * Only does basic variable replacements without extracted data logic.
 * Used when creating missing files from the issues dropdown.
 */
export function processTemplateForFile(
  template: string,
  data: { projectName: string; projectSlug: string },
): string {
  let content = template
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10)
  const projectId = `${dateStr.replace(/-/g, '')}-${data.projectSlug.toLowerCase().slice(0, 12)}`

  // Basic replacements
  content = content.replace(/"<Project Name>"/g, `"${data.projectName}"`)
  content = content.replace(/"<Short Codename>"/g, `"${data.projectSlug}"`)
  content = content.replace(/"<YYYYMMDD-shortslug>"/g, `"${projectId}"`)
  content = content.replace(/— <Project Name>/g, `— ${data.projectName}`)

  return content
}

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
  content = content.replace(/"<Project Name>"/g, `"${data.projectName}"`)
  content = content.replace(/"<Short Codename>"/g, `"${data.projectSlug}"`)
  content = content.replace(/"<YYYYMMDD-shortslug>"/g, `"${projectId}"`)

  // === MARKDOWN TITLE REPLACEMENTS ===
  content = content.replace(/— <Project Name>/g, `— ${data.projectName}`)

  // === CONTENT REPLACEMENTS (Overview.md specific) ===
  if (templateName === 'overview' && data.extracted) {
    const v = data.extracted.vision
    const c = data.extracted.constraints
    const e = data.extracted.execution

    if (v.oneLinePitch || v.description) {
      content = content.replace(
        /<What are you building, for whom, and why does it matter\?>/g,
        v.description || v.oneLinePitch,
      )
    }

    if (v.problemSolved) {
      content = content.replace(/<What hurts today\?>/g, v.problemSolved)
    }

    if (v.primaryAudience) {
      content = content.replace(/<Who\?>/g, v.primaryAudience)
    }

    if (v.secondaryAudience) {
      content = content.replace(
        /- \*\*Primary user\(s\):\*\* .*/,
        `- **Primary user(s):** ${v.primaryAudience}\n- **Secondary user(s):** ${v.secondaryAudience}`,
      )
    }

    if (c.antiGoals && c.antiGoals.length > 0) {
      const antiGoalBullets = c.antiGoals.map((g) => `- ${g}`).join('\n')
      content = content.replace(
        /### Out-of-Scope \(Anti-Goals\)\n- <Bullets>/,
        `### Out-of-Scope (Anti-Goals)\n${antiGoalBullets}`,
      )
    }

    if (c.known && c.known.length > 0) {
      const constraintBullets = c.known.map((k) => `- ${k}`).join('\n')
      content = content.replace(
        /## Constraints\n- \*\*Time:\*\* <deadlines, cadence>\n- \*\*Tech:\*\* <stack constraints, hosting constraints>\n- \*\*Money:\*\* <budget or "as close to \$0 as possible">\n- \*\*Operational:\*\* <privacy, local-first, offline, etc.>/,
        `## Constraints\n${constraintBullets}`,
      )
    }

    if (e.techStack) {
      content = content.replace(/<stack constraints, hosting constraints>/g, e.techStack)
    }
  }

  // === ROADMAP SPECIFIC ===
  if (templateName === 'roadmap') {
    const isMinimal = hasMinimalExtractedData(data)

    if (isMinimal) {
      content = content.replace(/M1 — <Milestone title>/g, 'M1 — Define the Project')
      content = content.replace(/M2 — <Milestone title>/g, 'M2 — Initial Setup')

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
      content = content.replace(/<Slice Name>/g, 'Project Definition')
      content = content.replace(
        /<End-to-end capability you can demo>/g,
        'Project has enough definition for Lachesis to assist',
      )
      content = content.replace(
        /<Value \/ milestone alignment>/g,
        'Aligns with M1 — Define the Project',
      )

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
    const timestamp = today.toTimeString().slice(0, 5)
    content = content.replace(
      /<Write whatever you want here. No structure required.>/,
      `## ${dateStr}\n### ${timestamp} — Project created\nProject scaffolded via Lachesis.${data.oneLiner ? `\n\n**One-liner:** ${data.oneLiner}` : ''}`,
    )
  }

  // === FINAL CLEANUP ===
  content = content.replace(/<[^<>]+>/g, '')
  content = content.replace(/^- \s*$/gm, '')
  content = content.replace(/\n{3,}/g, '\n\n')

  return content
}

// ============================================================================
// Scaffolder
// ============================================================================

export async function scaffoldProject(
  vault: Vault,
  projectsFolder: string,
  projectSlug: string,
  projectData?: ScaffoldProjectData,
): Promise<ScaffoldResult> {
  try {
    // Validate projects folder
    if (!projectsFolder || projectsFolder.trim() === '') {
      return {
        success: false,
        error: 'Projects folder is not configured. Please update plugin settings.',
      }
    }

    // Normalize folder path
    const normalizedFolder = projectsFolder.replace(/^\/+|\/+$/g, '')

    // Create projects folder if it doesn't exist
    const projectsFolderExists = vault.getAbstractFileByPath(normalizedFolder)
    if (!projectsFolderExists) {
      await vault.createFolder(normalizedFolder)
    }

    // Create project directory path
    const projectPath = `${normalizedFolder}/${projectSlug}`

    // Check if project already exists
    const existingProject = vault.getAbstractFileByPath(projectPath)
    if (existingProject) {
      return {
        success: false,
        error: `Project directory already exists: ${projectPath}`,
      }
    }

    // Create project folder
    await vault.createFolder(projectPath)

    // Create .ai folder for AI config
    const aiConfigFolder = `${projectPath}/.ai`
    await vault.createFolder(aiConfigFolder)

    // Default project data if not provided
    const data: ScaffoldProjectData = projectData ?? {
      projectName: projectSlug,
      projectSlug,
    }

    // Create .ai/config.json with GitHub repo if provided
    const githubRepo = data.extracted?.config?.githubRepo || ''
    const aiConfig: Record<string, unknown> = {
      $schema: 'https://lachesis.dev/schemas/ai-config.json',
      github_repo: githubRepo,
    }
    // Only add notes if repo is not configured
    if (!githubRepo) {
      aiConfig.notes =
        'Add your GitHub repo URL (e.g., "github.com/user/repo") to enable commit analysis for task tracking.'
    }
    await vault.create(`${aiConfigFolder}/config.json`, JSON.stringify(aiConfig, null, 2))

    // Create all template files
    const files: Array<{ path: string; template: TemplateName }> = [
      { path: `${projectPath}/Overview.md`, template: 'overview' },
      { path: `${projectPath}/Roadmap.md`, template: 'roadmap' },
      { path: `${projectPath}/Tasks.md`, template: 'tasks' },
      { path: `${projectPath}/Log.md`, template: 'log' },
      { path: `${projectPath}/Ideas.md`, template: 'ideas' },
      { path: `${projectPath}/Archive.md`, template: 'archive' },
    ]

    // Write all files
    for (const file of files) {
      const rawTemplate = TEMPLATES[file.template]
      const processedContent = processTemplate(rawTemplate, file.template, data)
      await vault.create(file.path, processedContent)
    }

    return { success: true, projectPath }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { success: false, error }
  }
}

export async function projectExists(
  vault: Vault,
  projectsFolder: string,
  slug: string,
): Promise<boolean> {
  const normalizedFolder = projectsFolder.replace(/^\/+|\/+$/g, '')
  const projectPath = `${normalizedFolder}/${slug}`
  return vault.getAbstractFileByPath(projectPath) !== null
}
