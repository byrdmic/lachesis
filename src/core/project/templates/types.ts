// Template types - shared type definitions for template evaluation

/**
 * Definition of template-specific evaluation rules.
 */
export type TemplateDefinition = {
  /** Placeholder patterns that indicate unfilled template content */
  placeholders: string[]
  /** Minimum characters of non-placeholder content to be considered "filled" */
  minMeaningful: number
  /** If true, an empty body is treated as template_only */
  treatEmptyAsTemplate: boolean
}

/**
 * Result of heading validation for structured templates.
 */
export type HeadingValidation = {
  isValid: boolean
  missingHeadings: string[]
  extraHeadings: string[]
}

/**
 * Extended validation for Roadmap.md which tracks milestone subheadings.
 */
export type RoadmapHeadingValidation = HeadingValidation & {
  hasMilestoneSubheadings: boolean
}
