// Templates module - template evaluation rules and helpers

// Types
export type { TemplateDefinition, HeadingValidation, RoadmapHeadingValidation } from './types'

// Utilities
export {
  COMMON_PLACEHOLDERS,
  stripFrontmatter,
  normalize,
  stripPlaceholders,
  countUnfilledPlaceholders,
} from './utils'

// Overview rules
export {
  OVERVIEW_EXPECTED_HEADINGS,
  OVERVIEW_PLACEHOLDERS,
  OVERVIEW_DEFINITION,
  validateOverviewHeadings,
  fixOverviewHeadings,
} from './overview'

// Roadmap rules
export {
  ROADMAP_EXPECTED_HEADINGS,
  ROADMAP_PLACEHOLDERS,
  ROADMAP_DEFINITION,
  validateRoadmapHeadings,
  fixRoadmapHeadings,
} from './roadmap'

// All template definitions
export { TEMPLATE_DEFINITIONS } from './definitions'
