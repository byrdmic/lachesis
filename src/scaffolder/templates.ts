// Bundled markdown templates for project scaffolding
// Simplified templates: no frontmatter, no title lines, minimal structure

export type TemplateName = 'overview' | 'roadmap' | 'tasks' | 'log' | 'ideas' | 'archive'

export const TEMPLATES: Record<TemplateName, string> = {
  overview: `## Elevator Pitch

## Problem Statement

## Target Users

## Value Proposition

## Scope

## Constraints / Principles
`,

  roadmap: `## Milestones
`,

  tasks: `## Current
`,

  log: '',

  ideas: '',

  archive: `## Completed Work
`,
}
