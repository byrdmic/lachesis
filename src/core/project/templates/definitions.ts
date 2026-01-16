// Template definitions - placeholder patterns and thresholds for all core files

import type { ExpectedCoreFile } from '../snapshot'
import type { TemplateDefinition } from './types'
import { OVERVIEW_DEFINITION } from './overview'
import { ROADMAP_DEFINITION } from './roadmap'
import { COMMON_PLACEHOLDERS } from './utils'

// ============================================================================
// Simple Template Definitions
// ============================================================================

const TASKS_DEFINITION: TemplateDefinition = {
  placeholders: [
    ...COMMON_PLACEHOLDERS,
    '<Smallest concrete step (~15–60 minutes)>',
    '<Next step>',
    '<Standalone task with no slice>',
    '<Standalone task>',
    '<Task description>',
    "<How you'll know it's done>",
    '<Thing blocked>',
    '<dependency>',
    '<unblock plan: <...>>',
  ],
  minMeaningful: 100,
  treatEmptyAsTemplate: true,
}

const LOG_DEFINITION: TemplateDefinition = {
  placeholders: [
    ...COMMON_PLACEHOLDERS,
    '<Write whatever you want here. No structure required.>',
  ],
  minMeaningful: 50,
  treatEmptyAsTemplate: true,
}

const IDEAS_DEFINITION: TemplateDefinition = {
  placeholders: [
    ...COMMON_PLACEHOLDERS,
    '<Question>',
    '<A / B / C>',
    '<What would decide it: <...>>',
  ],
  minMeaningful: 50,
  treatEmptyAsTemplate: true,
}

const ARCHIVE_DEFINITION: TemplateDefinition = {
  placeholders: [
    ...COMMON_PLACEHOLDERS,
    '<YYYY-MM-DD>',
    '<what shipped>',
    '<repo/commit/PR/notes>',
    '<what you learned / what changed>',
    '<Old Plan Title>',
    '<link to new plan>',
    '<rationale>',
    '<Idea Title>',
    "<Long-form rationale that doesn't belong in Overview/Log>",
    '<If revisited, what would need to be true: <...>>',
  ],
  minMeaningful: 100,
  treatEmptyAsTemplate: true,
}

// ============================================================================
// Combined Definitions
// ============================================================================

/**
 * Template definitions for all expected core files.
 */
export const TEMPLATE_DEFINITIONS: Record<ExpectedCoreFile, TemplateDefinition> = {
  'Overview.md': OVERVIEW_DEFINITION,
  'Roadmap.md': ROADMAP_DEFINITION,
  'Tasks.md': TASKS_DEFINITION,
  'Log.md': LOG_DEFINITION,
  'Ideas.md': IDEAS_DEFINITION,
  'Archive.md': ARCHIVE_DEFINITION,
}
