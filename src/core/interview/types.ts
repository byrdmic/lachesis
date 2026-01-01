// Interview engine types

export type PhaseId = 'setup' | 'vision' | 'finalize'

export type QuestionType = 'text' | 'select' | 'multiline' | 'confirm'

export type SelectOption = {
  label: string
  value: string
}

export type Question = {
  id: string
  phase: PhaseId
  text: string
  type: QuestionType
  options?: SelectOption[]
  required?: boolean
}

export type Answer = {
  questionId: string
  value: string | string[]
  timestamp: string
}

export type PhaseDefinition = {
  id: PhaseId
  name: string
  description: string
  questions: Question[]
  summaryCheckQuestion: string
}

export type InterviewState = {
  currentPhase: PhaseId
  currentQuestionIndex: number
  answers: Map<string, Answer>
  isComplete: boolean
}
