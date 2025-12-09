// Interview engine - manages the flow of questions and phases
import type { Question, PhaseId, Answer } from './types.ts'
import { depthToNumber } from './types.ts'
import { allPhases, setupQuestions } from './phases.ts'
import type { InterviewDepth } from '../project/types.ts'

export type EngineConfig = {
  depth: InterviewDepth
}

/**
 * Filter questions based on interview depth
 */
export function getQuestionsForDepth(
  questions: Question[],
  depth: InterviewDepth,
): Question[] {
  const depthNum = depthToNumber(depth)
  return questions.filter((q) => {
    const minDepth = q.minDepth ?? 1
    return minDepth <= depthNum
  })
}

/**
 * Get all questions for a phase, filtered by depth
 */
export function getPhaseQuestions(
  phaseId: PhaseId,
  depth: InterviewDepth,
): Question[] {
  if (phaseId === 'setup') {
    return setupQuestions
  }

  const phase = allPhases.find((p) => p.id === phaseId)
  if (!phase) return []

  return getQuestionsForDepth(phase.questions, depth)
}

/**
 * Get the next phase after the current one
 * Simplified flow: setup -> vision (AI discovery) -> finalize
 */
export function getNextPhase(currentPhase: PhaseId): PhaseId | null {
  const phaseOrder: PhaseId[] = [
    'setup',
    'vision', // AI-guided discovery
    'finalize',
  ]

  const currentIndex = phaseOrder.indexOf(currentPhase)
  if (currentIndex === -1 || currentIndex === phaseOrder.length - 1) {
    return null
  }

  return phaseOrder[currentIndex + 1] ?? null
}

/**
 * Get questions for batch mode (groups of 2-3)
 */
export function getBatchQuestions(
  questions: Question[],
  startIndex: number,
  batchSize: number = 3,
): Question[] {
  return questions.slice(startIndex, startIndex + batchSize)
}

/**
 * Check if all required questions in a phase are answered
 */
export function isPhaseComplete(
  phaseId: PhaseId,
  depth: InterviewDepth,
  answers: Map<string, Answer>,
): boolean {
  const questions = getPhaseQuestions(phaseId, depth)
  const requiredQuestions = questions.filter((q) => q.required)

  return requiredQuestions.every((q) => answers.has(q.id))
}

/**
 * Get answer value by question ID
 */
export function getAnswerValue(
  answers: Map<string, Answer>,
  questionId: string,
): string | undefined {
  const answer = answers.get(questionId)
  if (!answer) return undefined
  return Array.isArray(answer.value) ? answer.value.join(', ') : answer.value
}

/**
 * Create an answer record
 */
export function createAnswer(
  questionId: string,
  value: string | string[],
): Answer {
  return {
    questionId,
    value,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Get phase display info
 */
export function getPhaseInfo(phaseId: PhaseId): {
  name: string
  number: number
} {
  const phaseMap: Record<PhaseId, { name: string; number: number }> = {
    setup: { name: 'Setup', number: 0 },
    vision: { name: 'AI Discovery', number: 1 },
    finalize: { name: 'Finalize', number: 2 },
  }
  return phaseMap[phaseId]
}
