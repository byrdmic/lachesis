// Builds a ProjectDefinition from interview answers or AI-extracted data
import type { Answer } from '../interview/types.ts'
import type {
  ProjectDefinition,
  ProjectVision,
  ProjectConstraints,
  ProjectSolution,
  ExecutionPlan,
  SessionLogEntry,
  PlanningLevel,
} from './types.ts'
import { createSlug, nowISO } from './types.ts'
import { createEmptyAdvisorsConfig } from '../../advisors/types.ts'
import type {
  ExtractedProjectData,
  ConversationMessage,
} from '../../ai/client.ts'

// Legacy builder input (for backwards compatibility)
type LegacyBuilderInput = {
  name: string
  planningLevel: PlanningLevel
  answers: Map<string, Answer>
  sessionLog: SessionLogEntry[]
}

// New AI-based builder input
type AIBuilderInput = {
  name: string
  planningLevel: PlanningLevel
  extractedData: ExtractedProjectData
  conversationLog: ConversationMessage[]
}

// Combined input type
export type BuilderInput = LegacyBuilderInput | AIBuilderInput

// Type guard
function isAIInput(input: BuilderInput): input is AIBuilderInput {
  return 'extractedData' in input
}

// ============================================================================
// Legacy helpers (for backwards compatibility)
// ============================================================================

function getAnswer(answers: Map<string, Answer>, id: string): string {
  const answer = answers.get(id)
  if (!answer) return ''
  return Array.isArray(answer.value) ? answer.value.join(', ') : answer.value
}

function parseList(value: string): string[] {
  if (!value.trim()) return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function buildVisionFromAnswers(answers: Map<string, Answer>): ProjectVision {
  return {
    oneLinePitch: getAnswer(answers, 'vision_one_liner'),
    description: getAnswer(answers, 'vision_one_liner'),
    primaryAudience: getAnswer(answers, 'vision_audience'),
    secondaryAudience: undefined,
    whyItMatters: getAnswer(answers, 'vision_pain'),
    successLooksLike: getAnswer(answers, 'vision_success'),
    nonGoals: parseList(getAnswer(answers, 'vision_non_goals')),
  }
}

function buildConstraintsFromAnswers(
  answers: Map<string, Answer>,
): ProjectConstraints {
  return {
    knownConstraints: parseList(getAnswer(answers, 'constraints_known')),
    assumptions: parseList(getAnswer(answers, 'constraints_assumptions')),
    risks: parseList(getAnswer(answers, 'constraints_risks')),
    derailmentFactors: parseList(getAnswer(answers, 'constraints_derail')),
    antiGoals: parseList(getAnswer(answers, 'constraints_anti')),
  }
}

function buildSolutionFromAnswers(
  answers: Map<string, Answer>,
): ProjectSolution {
  return {
    approach: getAnswer(answers, 'solution_how'),
    primaryMechanism: getAnswer(answers, 'solution_mechanism'),
    differentiation: getAnswer(answers, 'solution_different'),
    coreLoop: getAnswer(answers, 'solution_core_loop'),
    excitement: getAnswer(answers, 'solution_excitement'),
  }
}

function buildExecutionFromAnswers(
  answers: Map<string, Answer>,
): ExecutionPlan {
  return {
    firstMove: getAnswer(answers, 'execution_first'),
    secondMove: getAnswer(answers, 'execution_second') || undefined,
    thirdMove: getAnswer(answers, 'execution_third') || undefined,
    notYet: parseList(getAnswer(answers, 'execution_not_yet')),
  }
}

// ============================================================================
// AI-based builders
// ============================================================================

function buildVisionFromAI(data: ExtractedProjectData): ProjectVision {
  return {
    oneLinePitch: data.vision.oneLinePitch,
    description: data.vision.description,
    primaryAudience: data.vision.primaryAudience,
    secondaryAudience: data.vision.secondaryAudience,
    whyItMatters: data.vision.problemSolved,
    successLooksLike: data.vision.successCriteria,
    nonGoals: data.constraints.antiGoals,
  }
}

function buildConstraintsFromAI(
  data: ExtractedProjectData,
): ProjectConstraints {
  return {
    knownConstraints: data.constraints.known,
    assumptions: data.constraints.assumptions,
    risks: data.constraints.risks,
    derailmentFactors: [],
    antiGoals: data.constraints.antiGoals,
  }
}

function buildSolutionFromAI(data: ExtractedProjectData): ProjectSolution {
  return {
    approach: data.vision.description,
    primaryMechanism: '',
    differentiation: '',
    coreLoop: '',
    excitement: '',
  }
}

function buildExecutionFromAI(data: ExtractedProjectData): ExecutionPlan {
  return {
    firstMove: data.execution.suggestedFirstMove || '',
    secondMove: undefined,
    thirdMove: undefined,
    notYet: [],
  }
}

// Convert conversation log to session log format
function convertConversationToSessionLog(
  messages: ConversationMessage[],
): SessionLogEntry[] {
  return messages.map((msg) => ({
    phase: 'vision',
    question: msg.role === 'assistant' ? msg.content : '',
    answer: msg.role === 'user' ? msg.content : '',
    timestamp: msg.timestamp,
  }))
}

// ============================================================================
// Main builder function
// ============================================================================

export function buildProjectDefinition(input: BuilderInput): ProjectDefinition {
  const { name, planningLevel } = input
  const now = nowISO()
  const slug = createSlug(name)

  if (isAIInput(input)) {
    // AI-based input
    const { extractedData, conversationLog } = input

    return {
      name,
      slug,
      createdAt: now,
      updatedAt: now,
      status: 'idea',
      releasePhase: 'seed',
      setup: {
        planningLevel,
      },
      vision: buildVisionFromAI(extractedData),
      constraints: buildConstraintsFromAI(extractedData),
      solution: buildSolutionFromAI(extractedData),
      execution: buildExecutionFromAI(extractedData),
      advisorsConfig: createEmptyAdvisorsConfig(name),
      sessionLog: convertConversationToSessionLog(conversationLog),
    }
  } else {
    // Legacy answer-based input
    const { answers, sessionLog } = input

    return {
      name,
      slug,
      createdAt: now,
      updatedAt: now,
      status: 'idea',
      releasePhase: 'seed',
      setup: {
        planningLevel,
      },
      vision: buildVisionFromAnswers(answers),
      constraints: buildConstraintsFromAnswers(answers),
      solution: buildSolutionFromAnswers(answers),
      execution: buildExecutionFromAnswers(answers),
      advisorsConfig: createEmptyAdvisorsConfig(name),
      sessionLog,
    }
  }
}
