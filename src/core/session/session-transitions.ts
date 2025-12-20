// Session state machine transitions
// Defines valid transitions between session steps

import type { SessionStep } from './types.ts'

// ============================================================================
// State Machine Definition
// ============================================================================

/**
 * Valid transitions from each state.
 * The state machine ensures sessions progress correctly through the conversation flow.
 */
const VALID_TRANSITIONS: Record<SessionStep, SessionStep[]> = {
  // Initial state - can start generating or go straight to error
  idle: ['generating_question', 'error'],

  // Generating a question - can succeed to waiting, or fail to error
  generating_question: ['waiting_for_answer', 'error'],

  // Waiting for user input - can generate next question, generate names, or error
  waiting_for_answer: ['generating_question', 'generating_names', 'error'],

  // Generating name suggestions - can show naming UI or error
  generating_names: ['naming_project', 'error', 'extracting_data'], // extracting_data if names fail, use default

  // User selecting/entering name - can extract data or error
  naming_project: ['extracting_data', 'error'],

  // Extracting structured data - can be ready to scaffold or error
  extracting_data: ['ready_to_scaffold', 'error'],

  // Ready to create project files - can scaffold or error
  ready_to_scaffold: ['scaffolding', 'error'],

  // Creating files - can complete or error
  scaffolding: ['complete', 'error'],

  // Terminal states - no transitions out (except retry from error)
  complete: [],
  error: ['idle', 'generating_question'], // Can retry from error
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check if a transition from one step to another is valid.
 */
export function isValidTransition(
  from: SessionStep,
  to: SessionStep,
): boolean {
  const validTargets = VALID_TRANSITIONS[from]
  return validTargets?.includes(to) ?? false
}

/**
 * Get all valid next steps from the current step.
 */
export function getValidNextSteps(currentStep: SessionStep): SessionStep[] {
  return VALID_TRANSITIONS[currentStep] ?? []
}

/**
 * Check if a step is a terminal state (no further transitions possible).
 */
export function isTerminalState(step: SessionStep): boolean {
  const validTargets = VALID_TRANSITIONS[step]
  return !validTargets || validTargets.length === 0
}

/**
 * Check if the step allows retrying from error.
 */
export function canRetryFromError(errorStep: SessionStep): boolean {
  return errorStep === 'error' && VALID_TRANSITIONS.error.length > 0
}

// ============================================================================
// Step Categories
// ============================================================================

/**
 * Steps where the user can provide input.
 */
export const INPUT_STEPS: SessionStep[] = ['waiting_for_answer', 'naming_project']

/**
 * Steps where AI is processing.
 */
export const PROCESSING_STEPS: SessionStep[] = [
  'generating_question',
  'generating_names',
  'extracting_data',
  'scaffolding',
]

/**
 * Steps that represent success states.
 */
export const SUCCESS_STEPS: SessionStep[] = ['complete']

/**
 * Steps that represent failure states.
 */
export const FAILURE_STEPS: SessionStep[] = ['error']

/**
 * Check if the current step is an input step.
 */
export function isInputStep(step: SessionStep): boolean {
  return INPUT_STEPS.includes(step)
}

/**
 * Check if the current step is a processing step.
 */
export function isProcessingStep(step: SessionStep): boolean {
  return PROCESSING_STEPS.includes(step)
}

/**
 * Check if the current step is a success step.
 */
export function isSuccessStep(step: SessionStep): boolean {
  return SUCCESS_STEPS.includes(step)
}

/**
 * Check if the current step is a failure step.
 */
export function isFailureStep(step: SessionStep): boolean {
  return FAILURE_STEPS.includes(step)
}

// ============================================================================
// Step Descriptions (for CLI/UI status messages)
// ============================================================================

/**
 * Human-readable descriptions for each step.
 */
export const STEP_DESCRIPTIONS: Record<SessionStep, string> = {
  idle: 'Session created',
  generating_question: 'Generating next question',
  waiting_for_answer: 'Waiting for your response',
  generating_names: 'Generating project name suggestions',
  naming_project: 'Choose a project name',
  extracting_data: 'Extracting project details',
  ready_to_scaffold: 'Ready to create project files',
  scaffolding: 'Creating project files',
  complete: 'Project created successfully',
  error: 'An error occurred',
}

/**
 * Get a human-readable description of the current step.
 */
export function getStepDescription(step: SessionStep): string {
  return STEP_DESCRIPTIONS[step] ?? 'Unknown step'
}

// ============================================================================
// Progress Tracking
// ============================================================================

/**
 * Ordered list of steps in the happy path flow.
 */
const HAPPY_PATH_STEPS: SessionStep[] = [
  'idle',
  'generating_question',
  'waiting_for_answer',
  // Note: generating_question and waiting_for_answer may repeat
  'generating_names',
  'naming_project',
  'extracting_data',
  'ready_to_scaffold',
  'scaffolding',
  'complete',
]

/**
 * Get the approximate progress percentage for a step.
 * This is a rough estimate for UI progress indicators.
 */
export function getStepProgress(step: SessionStep): number {
  if (step === 'error') return 0
  if (step === 'complete') return 100

  // For conversation steps, use a lower percentage since they repeat
  if (step === 'generating_question' || step === 'waiting_for_answer') {
    return 20
  }

  const index = HAPPY_PATH_STEPS.indexOf(step)
  if (index === -1) return 0

  // Start progress at generating_names which is roughly 40% through
  const startIndex = HAPPY_PATH_STEPS.indexOf('generating_names')
  if (index < startIndex) return 20

  // Map remaining steps to 40-100%
  const remainingSteps = HAPPY_PATH_STEPS.length - startIndex
  const currentPosition = index - startIndex
  return Math.round(40 + (currentPosition / remainingSteps) * 60)
}
