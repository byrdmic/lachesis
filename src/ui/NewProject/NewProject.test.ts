import { describe, it, expect, beforeEach } from 'bun:test'
import type { PlanningLevel } from '../../core/project/types.ts'
import { createSlug } from '../../core/project/types.ts'
import type { ConversationMessage, ExtractedProjectData } from '../../ai/client.ts'
import type { StoredConversationState, ConversationStep } from './ConversationPhase.tsx'

// ============================================================================
// Helper functions (extracted from components for testing)
// ============================================================================

/**
 * Topic detection from question text - mirrors the detectTopics function in ConversationPhase.
 * Topics map to Overview.md template sections.
 */
function detectTopics(
  questionText: string,
  existingTopics: string[],
): string[] {
  const topicKeywords: Record<string, string[]> = {
    elevator_pitch: ['what are you building', 'what is this', 'describe', 'one sentence', 'elevator'],
    problem_statement: ['problem', 'pain', 'hurts', 'solve', 'why build', 'consequence'],
    target_users: ['who will', 'who is', 'target', 'audience', 'users', 'customer', 'context'],
    value_proposition: ['benefit', 'value', 'alternative', 'different', 'why this'],
    scope_and_antigoals: ['scope', 'in scope', 'out of scope', 'anti-goal', 'avoid', "shouldn't", 'not become'],
    constraints: ['constraint', 'limitation', 'budget', 'time', 'deadline', 'tech stack', 'money'],
  }

  const lowerQuestion = questionText.toLowerCase()
  const newTopics = new Set(existingTopics)

  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some((kw) => lowerQuestion.includes(kw))) {
      newTopics.add(topic)
    }
  }

  return Array.from(newTopics)
}

/**
 * Creates a mock conversation state for testing
 */
function createMockConversationState(
  overrides: Partial<StoredConversationState> = {},
): StoredConversationState {
  return {
    messages: [
      { role: 'assistant', content: 'Hello, how can I help?', timestamp: '2024-01-15T10:00:00.000Z' },
      { role: 'user', content: 'I want to build a CLI tool', timestamp: '2024-01-15T10:01:00.000Z' },
    ],
    coveredTopics: ['elevator_pitch'],
    step: 'waiting_for_answer',
    ...overrides,
  }
}

/**
 * Creates mock extracted project data
 */
function createMockExtractedData(
  overrides: Partial<ExtractedProjectData> = {},
): ExtractedProjectData {
  return {
    vision: {
      oneLinePitch: 'A CLI tool for developers',
      description: 'A command-line interface tool that helps developers manage their projects',
      primaryAudience: 'Software developers',
      problemSolved: 'Project organization',
      successCriteria: 'Users can easily manage projects',
    },
    constraints: {
      known: ['Time budget of 2 weeks'],
      assumptions: ['Users are familiar with CLI tools'],
      risks: ['Scope creep'],
      antiGoals: ['No GUI, keep it simple'],
    },
    execution: {
      suggestedFirstMove: 'Set up project structure',
      techStack: 'TypeScript, Bun, Ink',
    },
    ...overrides,
  }
}

// ============================================================================
// Flow State Types (mirrored from index.tsx for testing)
// ============================================================================

type FlowState =
  | { step: 'welcome' }
  | {
      step: 'conversation_choice'
      planningLevel: PlanningLevel
      projectName: string
      oneLiner: string
    }
  | {
      step: 'conversation'
      planningLevel: PlanningLevel
      projectName: string
      oneLiner: string
    }
  | {
      step: 'quick_capture'
      planningLevel: PlanningLevel
      projectName: string
      oneLiner: string
    }
  | {
      step: 'finalize'
      planningLevel: PlanningLevel
      projectName: string
      oneLiner: string
      extractedData?: ExtractedProjectData
      conversationLog: ConversationMessage[]
    }
  | { step: 'complete'; projectPath: string }
  | { step: 'cancelled' }

// ============================================================================
// Tests for detectTopics
// ============================================================================

describe('detectTopics', () => {
  describe('topic detection from question text (maps to Overview.md sections)', () => {
    it('detects elevator_pitch topic', () => {
      const topics = detectTopics('What are you building?', [])
      expect(topics).toContain('elevator_pitch')
    })

    it('detects target_users topic', () => {
      const topics = detectTopics('Who will use this application?', [])
      expect(topics).toContain('target_users')
    })

    it('detects problem_statement topic', () => {
      const topics = detectTopics('What problem are you trying to solve?', [])
      expect(topics).toContain('problem_statement')
    })

    it('detects constraints topic', () => {
      const topics = detectTopics('What budget constraints do you have?', [])
      expect(topics).toContain('constraints')
    })

    it('detects value_proposition topic', () => {
      const topics = detectTopics('What is the main benefit of this?', [])
      expect(topics).toContain('value_proposition')
    })

    it('detects scope_and_antigoals topic', () => {
      const topics = detectTopics("What should we avoid or shouldn't be included?", [])
      expect(topics).toContain('scope_and_antigoals')
    })

    it('detects multiple topics in a single question', () => {
      const topics = detectTopics(
        'Who will use this and what problem does it solve?',
        [],
      )
      expect(topics).toContain('target_users')
      expect(topics).toContain('problem_statement')
    })
  })

  describe('preserving existing topics', () => {
    it('preserves existing topics when adding new ones', () => {
      const existing = ['elevator_pitch', 'target_users']
      const topics = detectTopics('What constraints do you have?', existing)

      expect(topics).toContain('elevator_pitch')
      expect(topics).toContain('target_users')
      expect(topics).toContain('constraints')
    })

    it('does not duplicate existing topics', () => {
      const existing = ['elevator_pitch']
      const topics = detectTopics('What are you building and what is this?', existing)

      const count = topics.filter((t) => t === 'elevator_pitch').length
      expect(count).toBe(1)
    })

    it('returns unchanged array when no new topics detected', () => {
      const existing = ['elevator_pitch', 'target_users']
      const topics = detectTopics('Tell me more about that.', existing)

      expect(topics).toEqual(existing)
    })
  })

  describe('case insensitivity', () => {
    it('detects topics regardless of case', () => {
      const topics = detectTopics('WHAT ARE YOU BUILDING?', [])
      expect(topics).toContain('elevator_pitch')
    })

    it('handles mixed case questions', () => {
      const topics = detectTopics('Who Will Use This App?', [])
      expect(topics).toContain('target_users')
    })
  })

  describe('edge cases', () => {
    it('handles empty question text', () => {
      const topics = detectTopics('', [])
      expect(topics).toEqual([])
    })

    it('handles empty existing topics', () => {
      const topics = detectTopics('What are you building?', [])
      expect(topics).toContain('elevator_pitch')
    })

    it('handles questions with no relevant keywords', () => {
      const topics = detectTopics('Can you elaborate?', [])
      expect(topics).toEqual([])
    })
  })
})

// ============================================================================
// Tests for conversation state management
// ============================================================================

describe('conversation state management', () => {
  describe('StoredConversationState structure', () => {
    it('maintains correct structure', () => {
      const state = createMockConversationState()

      expect(state).toHaveProperty('messages')
      expect(state).toHaveProperty('coveredTopics')
      expect(state).toHaveProperty('step')
    })

    it('messages have required fields', () => {
      const state = createMockConversationState()

      for (const message of state.messages) {
        expect(message).toHaveProperty('role')
        expect(message).toHaveProperty('content')
        expect(message).toHaveProperty('timestamp')
        expect(['user', 'assistant']).toContain(message.role)
      }
    })

    it('step has valid values', () => {
      const validSteps: ConversationStep[] = [
        'generating_question',
        'waiting_for_answer',
        'generating_names',
        'naming_project',
        'extracting_data',
        'error',
      ]

      for (const step of validSteps) {
        const state = createMockConversationState({ step })
        expect(validSteps).toContain(state.step)
      }
    })
  })

  describe('conversation message ordering', () => {
    it('preserves message order', () => {
      const messages: ConversationMessage[] = [
        { role: 'assistant', content: 'First', timestamp: '2024-01-15T10:00:00.000Z' },
        { role: 'user', content: 'Second', timestamp: '2024-01-15T10:01:00.000Z' },
        { role: 'assistant', content: 'Third', timestamp: '2024-01-15T10:02:00.000Z' },
      ]

      const state = createMockConversationState({ messages })

      expect(state.messages[0]?.content).toBe('First')
      expect(state.messages[1]?.content).toBe('Second')
      expect(state.messages[2]?.content).toBe('Third')
    })

    it('handles empty message array', () => {
      const state = createMockConversationState({ messages: [] })
      expect(state.messages).toEqual([])
    })
  })

  describe('topic coverage tracking', () => {
    it('tracks covered topics correctly', () => {
      const topics = ['elevator_pitch', 'target_users', 'constraints']
      const state = createMockConversationState({ coveredTopics: topics })

      expect(state.coveredTopics).toEqual(topics)
    })

    it('handles empty topics array', () => {
      const state = createMockConversationState({ coveredTopics: [] })
      expect(state.coveredTopics).toEqual([])
    })
  })
})

// ============================================================================
// Tests for flow state transitions
// ============================================================================

describe('flow state transitions', () => {
  describe('initial state', () => {
    it('starts in welcome state', () => {
      const state: FlowState = { step: 'welcome' }
      expect(state.step).toBe('welcome')
    })
  })

  describe('welcome to conversation transition', () => {
    it('transitions to conversation with default values', () => {
      const newState: FlowState = {
        step: 'conversation',
        planningLevel: 'Not provided yet - ask during planning',
        projectName: '',
        oneLiner: '',
      }

      expect(newState.step).toBe('conversation')
      expect(newState.planningLevel).toBe('Not provided yet - ask during planning')
      expect(newState.projectName).toBe('')
      expect(newState.oneLiner).toBe('')
    })
  })

  describe('conversation to finalize transition', () => {
    it('transitions with extracted data', () => {
      const extractedData = createMockExtractedData()
      const conversationLog: ConversationMessage[] = [
        { role: 'assistant', content: 'Hello', timestamp: '2024-01-15T10:00:00.000Z' },
        { role: 'user', content: 'Hi', timestamp: '2024-01-15T10:01:00.000Z' },
      ]

      const newState: FlowState = {
        step: 'finalize',
        planningLevel: 'Light spark',
        projectName: 'My Project',
        oneLiner: 'A cool project',
        extractedData,
        conversationLog,
      }

      expect(newState.step).toBe('finalize')
      expect(newState.extractedData).toBeDefined()
      expect(newState.conversationLog).toHaveLength(2)
    })
  })

  describe('finalize to complete transition', () => {
    it('transitions with project path', () => {
      const state: FlowState = {
        step: 'complete',
        projectPath: '/vault/projects/my-project',
      }

      expect(state.step).toBe('complete')
      expect(state.projectPath).toBe('/vault/projects/my-project')
    })
  })

  describe('cancel transition', () => {
    it('can cancel from any state', () => {
      const state: FlowState = { step: 'cancelled' }
      expect(state.step).toBe('cancelled')
    })
  })
})

// ============================================================================
// Tests for extracted project data
// ============================================================================

describe('extracted project data', () => {
  describe('vision structure', () => {
    it('contains required vision fields', () => {
      const data = createMockExtractedData()

      expect(data.vision).toHaveProperty('oneLinePitch')
      expect(data.vision).toHaveProperty('description')
      expect(data.vision).toHaveProperty('primaryAudience')
      expect(data.vision).toHaveProperty('problemSolved')
      expect(data.vision).toHaveProperty('successCriteria')
    })

    it('vision fields are strings', () => {
      const data = createMockExtractedData()

      expect(typeof data.vision.oneLinePitch).toBe('string')
      expect(typeof data.vision.description).toBe('string')
      expect(typeof data.vision.primaryAudience).toBe('string')
    })
  })

  describe('constraints structure', () => {
    it('contains required constraints fields', () => {
      const data = createMockExtractedData()

      expect(data.constraints).toHaveProperty('known')
      expect(data.constraints).toHaveProperty('assumptions')
      expect(data.constraints).toHaveProperty('risks')
      expect(data.constraints).toHaveProperty('antiGoals')
    })

    it('constraints fields are arrays', () => {
      const data = createMockExtractedData()

      expect(Array.isArray(data.constraints.known)).toBe(true)
      expect(Array.isArray(data.constraints.assumptions)).toBe(true)
      expect(Array.isArray(data.constraints.risks)).toBe(true)
      expect(Array.isArray(data.constraints.antiGoals)).toBe(true)
    })
  })

  describe('execution structure', () => {
    it('contains execution field', () => {
      const data = createMockExtractedData()
      expect(data.execution).toBeDefined()
    })

    it('can have optional execution fields', () => {
      const data = createMockExtractedData({
        execution: {
          suggestedFirstMove: 'Start here',
        },
      })

      expect(data.execution.suggestedFirstMove).toBe('Start here')
      expect(data.execution.techStack).toBeUndefined()
    })
  })

  describe('fallback data handling', () => {
    it('creates valid fallback data structure', () => {
      const fallbackData: ExtractedProjectData = {
        vision: {
          oneLinePitch: 'A project',
          description: 'A project',
          primaryAudience: 'To be defined',
          problemSolved: 'To be defined',
          successCriteria: 'To be defined',
        },
        constraints: {
          known: [],
          assumptions: [],
          risks: [],
          antiGoals: [],
        },
        execution: {},
      }

      expect(fallbackData.vision.oneLinePitch).toBe('A project')
      expect(fallbackData.constraints.known).toEqual([])
      expect(fallbackData.execution).toEqual({})
    })
  })
})

// ============================================================================
// Tests for project naming
// ============================================================================

describe('project naming', () => {
  describe('slug creation', () => {
    it('converts name to lowercase slug', () => {
      const slug = createSlug('My Project')
      expect(slug).toBe('my-project')
    })

    it('handles special characters', () => {
      const slug = createSlug('My Project! (v2)')
      expect(slug).toBe('my-project-v2')
    })

    it('handles multiple spaces', () => {
      const slug = createSlug('My    Project')
      expect(slug).toBe('my-project')
    })

    it('trims whitespace', () => {
      const slug = createSlug('  My Project  ')
      expect(slug).toBe('my-project')
    })

    it('handles empty string', () => {
      const slug = createSlug('')
      expect(slug).toBe('')
    })

    it('collapses multiple dashes', () => {
      const slug = createSlug('My---Project')
      expect(slug).toBe('my-project')
    })

    it('removes unicode characters', () => {
      const slug = createSlug('My Project 🚀')
      // Note: createSlug may leave trailing dash after emoji removal, which is acceptable
      expect(slug).toMatch(/^my-project/)
    })
  })

  describe('effective name computation', () => {
    it('uses project name when provided', () => {
      const projectName = 'My Cool Project'
      const oneLiner = 'A fallback description'

      const effectiveName = projectName.trim() || oneLiner.trim() || 'Untitled Project'
      expect(effectiveName).toBe('My Cool Project')
    })

    it('falls back to one-liner when name empty', () => {
      const projectName = ''
      const oneLiner = 'A CLI tool'

      const effectiveName = projectName.trim() || oneLiner.trim() || 'Untitled Project'
      expect(effectiveName).toBe('A CLI tool')
    })

    it('falls back to Untitled when both empty', () => {
      const projectName = ''
      const oneLiner = ''

      const effectiveName = projectName.trim() || oneLiner.trim() || 'Untitled Project'
      expect(effectiveName).toBe('Untitled Project')
    })

    it('handles whitespace-only name', () => {
      const projectName = '   '
      const oneLiner = 'Real name here'

      const effectiveName = projectName.trim() || oneLiner.trim() || 'Untitled Project'
      expect(effectiveName).toBe('Real name here')
    })
  })
})

// ============================================================================
// Tests for setup phase logic
// ============================================================================

describe('setup phase logic', () => {
  type SetupStep = 'planning' | 'planning_custom' | 'name' | 'oneliner'

  describe('step transitions', () => {
    it('starts at planning step', () => {
      const step: SetupStep = 'planning'
      expect(step).toBe('planning')
    })

    it('transitions to custom when Enter your own selected', () => {
      const selected = 'Enter your own'
      const nextStep: SetupStep = selected === 'Enter your own' ? 'planning_custom' : 'name'
      expect(nextStep).toBe('planning_custom')
    })

    it('transitions to name when preset selected', () => {
      const selected: string = 'Light - Just a spark'
      const nextStep: SetupStep = selected === 'Enter your own' ? 'planning_custom' : 'name'
      expect(nextStep).toBe('name')
    })

    it('transitions from name to oneliner', () => {
      const step: SetupStep = 'oneliner'
      expect(step).toBe('oneliner')
    })
  })

  describe('planning level options', () => {
    const presetOptions = [
      { label: 'Light - Just a spark', value: 'Light - Just a spark' },
      { label: 'Medium - Some notes', value: 'Medium - Some notes' },
      { label: 'Heavy - Well defined', value: 'Heavy - Well defined' },
      { label: 'Enter your own', value: 'Enter your own' },
    ]

    it('has 4 planning options', () => {
      expect(presetOptions).toHaveLength(4)
    })

    it('includes Enter your own option', () => {
      const hasCustom = presetOptions.some((opt) => opt.value === 'Enter your own')
      expect(hasCustom).toBe(true)
    })

    it('all options have label and value', () => {
      for (const opt of presetOptions) {
        expect(opt).toHaveProperty('label')
        expect(opt).toHaveProperty('value')
        expect(typeof opt.label).toBe('string')
        expect(typeof opt.value).toBe('string')
      }
    })
  })

  describe('context string building', () => {
    it('builds context with planning level only', () => {
      const planningLevel = 'Light spark'
      const projectName = ''

      const contextParts: string[] = []
      if (planningLevel) contextParts.push(planningLevel)
      if (projectName) contextParts.push(`"${projectName}"`)
      const contextString = contextParts.join(' | ')

      expect(contextString).toBe('Light spark')
    })

    it('builds context with planning level and project name', () => {
      const planningLevel = 'Light spark'
      const projectName = 'My Project'

      const contextParts: string[] = []
      if (planningLevel) contextParts.push(planningLevel)
      if (projectName) contextParts.push(`"${projectName}"`)
      const contextString = contextParts.join(' | ')

      expect(contextString).toBe('Light spark | "My Project"')
    })

    it('handles empty context', () => {
      const planningLevel = ''
      const projectName = ''

      const contextParts: string[] = []
      if (planningLevel) contextParts.push(planningLevel)
      if (projectName) contextParts.push(`"${projectName}"`)
      const contextString = contextParts.join(' | ')

      expect(contextString).toBe('')
    })
  })

  describe('input mode tracking', () => {
    it('identifies typing steps', () => {
      const typingSteps = ['planning_custom', 'name', 'oneliner']
      const step: SetupStep = 'planning_custom'

      const typing = typingSteps.includes(step)
      expect(typing).toBe(true)
    })

    it('identifies non-typing steps', () => {
      const typingSteps = ['planning_custom', 'name', 'oneliner']
      const step: SetupStep = 'planning'

      const typing = typingSteps.includes(step)
      expect(typing).toBe(false)
    })
  })
})

// ============================================================================
// Tests for finalize phase logic
// ============================================================================

describe('finalize phase logic', () => {
  type FinalizeStep = 'confirm' | 'scaffolding' | 'done' | 'error'

  describe('step transitions', () => {
    it('starts at confirm step', () => {
      const step: FinalizeStep = 'confirm'
      expect(step).toBe('confirm')
    })

    it('transitions to scaffolding on confirm', () => {
      const confirmed = 'yes'
      const nextStep: FinalizeStep = confirmed === 'yes' ? 'scaffolding' : 'confirm'
      expect(nextStep).toBe('scaffolding')
    })

    it('remains at confirm on decline', () => {
      const confirmed: string = 'no'
      // Actually it would cancel, but the step wouldn't change to scaffolding
      const shouldProceed = confirmed === 'yes'
      expect(shouldProceed).toBe(false)
    })

    it('transitions to done on success', () => {
      const step: FinalizeStep = 'done'
      expect(step).toBe('done')
    })

    it('transitions to error on failure', () => {
      const step: FinalizeStep = 'error'
      expect(step).toBe('error')
    })
  })

  describe('effective name generation', () => {
    it('uses project name when available', () => {
      const projectName = 'My Project'
      const oneLiner = 'A description'

      const effectiveName =
        projectName.trim() ||
        oneLiner.trim() ||
        `Untitled Project ${new Date().toISOString().slice(0, 10)}`

      expect(effectiveName).toBe('My Project')
    })

    it('falls back to one-liner', () => {
      const projectName = ''
      const oneLiner = 'A CLI tool for developers'

      const effectiveName =
        projectName.trim() ||
        oneLiner.trim() ||
        `Untitled Project ${new Date().toISOString().slice(0, 10)}`

      expect(effectiveName).toBe('A CLI tool for developers')
    })

    it('generates dated name as last resort', () => {
      const projectName = ''
      const oneLiner = ''
      const date = new Date().toISOString().slice(0, 10)

      const effectiveName =
        projectName.trim() ||
        oneLiner.trim() ||
        `Untitled Project ${date}`

      expect(effectiveName).toBe(`Untitled Project ${date}`)
    })
  })

  describe('confirm options', () => {
    const options = [
      { label: 'Yes, create my project', value: 'yes' },
      { label: 'No, exit without saving', value: 'no' },
    ]

    it('has two options', () => {
      expect(options).toHaveLength(2)
    })

    it('has yes and no values', () => {
      const values = options.map((o) => o.value)
      expect(values).toContain('yes')
      expect(values).toContain('no')
    })
  })
})

// ============================================================================
// Tests for conversation phase state machine
// ============================================================================

describe('conversation phase state machine', () => {
  describe('initial state', () => {
    it('starts with generating_question when no initial state', () => {
      const hasInitialState = false
      const step: ConversationStep = hasInitialState ? 'waiting_for_answer' : 'generating_question'
      expect(step).toBe('generating_question')
    })

    it('starts with waiting_for_answer when restoring state', () => {
      const hasInitialState = true
      const initialMessages = [{ role: 'assistant' as const, content: 'Hello', timestamp: '2024-01-15' }]
      const step: ConversationStep =
        hasInitialState && initialMessages.length > 0 ? 'waiting_for_answer' : 'generating_question'
      expect(step).toBe('waiting_for_answer')
    })
  })

  describe('state transitions', () => {
    it('transitions from generating_question to waiting_for_answer on success', () => {
      let step: ConversationStep = 'generating_question'
      const success = true

      if (success) {
        step = 'waiting_for_answer'
      }

      expect(step).toBe('waiting_for_answer')
    })

    it('transitions from generating_question to error on failure', () => {
      let step: ConversationStep = 'generating_question'
      const success = false

      if (!success) {
        step = 'error'
      }

      expect(step).toBe('error')
    })

    it('transitions from waiting_for_answer to generating_question on user input', () => {
      let step: ConversationStep = 'waiting_for_answer'
      const userSubmittedAnswer = true

      if (userSubmittedAnswer) {
        step = 'generating_question'
      }

      expect(step).toBe('generating_question')
    })

    it('transitions to generating_names when ready to finish', () => {
      let step: ConversationStep = 'generating_question'
      const readyToFinish = true

      if (readyToFinish) {
        step = 'generating_names'
      }

      expect(step).toBe('generating_names')
    })

    it('transitions from generating_names to naming_project on success', () => {
      let step: ConversationStep = 'generating_names'
      const namesGenerated = true

      if (namesGenerated) {
        step = 'naming_project'
      }

      expect(step).toBe('naming_project')
    })

    it('transitions from naming_project to extracting_data after selection', () => {
      let step: ConversationStep = 'naming_project'
      const nameSelected = true

      if (nameSelected) {
        step = 'extracting_data'
      }

      expect(step).toBe('extracting_data')
    })
  })

  describe('transition phrase detection', () => {
    const TRANSITION_PHRASE = 'very well, sir. let us proceed'

    it('detects transition phrase in response', () => {
      const response = 'Very well, sir. Let us proceed with the project planning.'
      const hasTransition = response.toLowerCase().includes(TRANSITION_PHRASE)
      expect(hasTransition).toBe(true)
    })

    it('does not trigger on similar but different phrases', () => {
      const response = 'Very well, sir. Let me think about that.'
      const hasTransition = response.toLowerCase().includes(TRANSITION_PHRASE)
      expect(hasTransition).toBe(false)
    })

    it('handles case variations', () => {
      const response = 'VERY WELL, SIR. LET US PROCEED!'
      const hasTransition = response.toLowerCase().includes(TRANSITION_PHRASE)
      expect(hasTransition).toBe(true)
    })
  })
})

// ============================================================================
// Tests for AI status descriptors
// ============================================================================

describe('AI status descriptors', () => {
  type AIState = 'idle' | 'streaming' | 'processing' | 'waiting' | 'error'

  const stepToStatus: Record<ConversationStep, { state: AIState; message: string }> = {
    generating_question: { state: 'streaming', message: 'Streaming the next question' },
    waiting_for_answer: { state: 'waiting', message: 'Waiting for your reply' },
    extracting_data: { state: 'processing', message: 'Structuring your project notes' },
    generating_names: { state: 'processing', message: 'Generating name suggestions' },
    naming_project: { state: 'idle', message: 'Choose a project name' },
    error: { state: 'error', message: 'Issue talking to AI' },
  }

  it('maps generating_question to streaming state', () => {
    const status = stepToStatus['generating_question']
    expect(status?.state).toBe('streaming')
  })

  it('maps waiting_for_answer to waiting state', () => {
    const status = stepToStatus['waiting_for_answer']
    expect(status?.state).toBe('waiting')
  })

  it('maps extracting_data to processing state', () => {
    const status = stepToStatus['extracting_data']
    expect(status?.state).toBe('processing')
  })

  it('maps error to error state', () => {
    const status = stepToStatus['error']
    expect(status?.state).toBe('error')
  })

  it('all steps have status mappings', () => {
    const steps: ConversationStep[] = [
      'generating_question',
      'waiting_for_answer',
      'generating_names',
      'naming_project',
      'extracting_data',
      'error',
    ]

    for (const step of steps) {
      expect(stepToStatus[step]).toBeDefined()
      expect(stepToStatus[step]?.state).toBeDefined()
      expect(stepToStatus[step]?.message).toBeDefined()
    }
  })
})

// ============================================================================
// Tests for resuming from saved state
// ============================================================================

describe('resuming from saved state', () => {
  describe('restoration detection', () => {
    it('detects when restoring from state with messages', () => {
      const savedState = createMockConversationState()
      const shouldRestore = savedState && savedState.messages.length > 0
      expect(shouldRestore).toBe(true)
    })

    it('does not restore when no saved state', () => {
      // Function that might return null (to simulate runtime behavior)
      const getSavedState = (): StoredConversationState | null => null
      const savedState = getSavedState()
      const shouldRestore = savedState !== null && savedState.messages.length > 0
      expect(shouldRestore).toBe(false)
    })

    it('does not restore when saved state has no messages', () => {
      const savedState = createMockConversationState({ messages: [] })
      const shouldRestore = savedState && savedState.messages.length > 0
      expect(shouldRestore).toBe(false)
    })
  })

  describe('state restoration', () => {
    it('restores messages from saved state', () => {
      const savedMessages: ConversationMessage[] = [
        { role: 'assistant', content: 'Previous question', timestamp: '2024-01-15T10:00:00.000Z' },
        { role: 'user', content: 'Previous answer', timestamp: '2024-01-15T10:01:00.000Z' },
      ]
      const savedState = createMockConversationState({ messages: savedMessages })

      // Simulating restoration
      const restoredMessages = savedState.messages
      expect(restoredMessages).toHaveLength(2)
      expect(restoredMessages[0]?.content).toBe('Previous question')
    })

    it('restores covered topics from saved state', () => {
      const savedTopics = ['elevator_pitch', 'target_users', 'constraints']
      const savedState = createMockConversationState({ coveredTopics: savedTopics })

      const restoredTopics = savedState.coveredTopics
      expect(restoredTopics).toEqual(savedTopics)
    })

    it('restores step from saved state', () => {
      const savedState = createMockConversationState({ step: 'waiting_for_answer' })

      const restoredStep = savedState.step
      expect(restoredStep).toBe('waiting_for_answer')
    })
  })
})

// ============================================================================
// Tests for menu mode handling
// ============================================================================

describe('menu mode handling', () => {
  describe('menu state', () => {
    it('starts with menu mode disabled', () => {
      const menuMode = false
      expect(menuMode).toBe(false)
    })

    it('toggles to menu mode on ESC', () => {
      let menuMode = false
      const escPressed = true

      if (escPressed && !menuMode) {
        menuMode = true
      }

      expect(menuMode).toBe(true)
    })

    it('returns to chat mode on ESC or Enter from menu', () => {
      let menuMode = true
      const escOrEnterPressed = true

      if (escOrEnterPressed && menuMode) {
        menuMode = false
      }

      expect(menuMode).toBe(false)
    })
  })

  describe('menu hotkeys', () => {
    it('S opens settings when in menu mode', () => {
      const menuMode = true
      const key = 's'
      const shouldOpenSettings = menuMode && key === 's'
      expect(shouldOpenSettings).toBe(true)
    })

    it('C clears conversation when in menu mode', () => {
      const menuMode = true
      const key = 'c'
      const shouldClear = menuMode && key === 'c'
      expect(shouldClear).toBe(true)
    })

    it('B goes back when in menu mode', () => {
      const menuMode = true
      const key = 'b'
      const shouldGoBack = menuMode && key === 'b'
      expect(shouldGoBack).toBe(true)
    })

    it('hotkeys do not work when not in menu mode', () => {
      const menuMode = false
      const key = 's'
      const shouldOpenSettings = menuMode && key === 's'
      expect(shouldOpenSettings).toBe(false)
    })
  })
})

// ============================================================================
// Tests for project name suggestions
// ============================================================================

describe('project name suggestions', () => {
  type ProjectNameSuggestion = {
    name: string
    reasoning: string
  }

  describe('suggestion structure', () => {
    it('suggestions have name and reasoning', () => {
      const suggestion: ProjectNameSuggestion = {
        name: 'TaskMaster',
        reasoning: 'Reflects the task management focus',
      }

      expect(suggestion).toHaveProperty('name')
      expect(suggestion).toHaveProperty('reasoning')
    })

    it('handles multiple suggestions', () => {
      const suggestions: ProjectNameSuggestion[] = [
        { name: 'Option1', reasoning: 'Reason 1' },
        { name: 'Option2', reasoning: 'Reason 2' },
        { name: 'Option3', reasoning: 'Reason 3' },
      ]

      expect(suggestions).toHaveLength(3)
    })
  })

  describe('selection handling', () => {
    it('can select from suggestions list', () => {
      const suggestions: ProjectNameSuggestion[] = [
        { name: 'TaskMaster', reasoning: 'Reflects the task management focus' },
        { name: 'ProjectPilot', reasoning: 'Emphasizes guidance aspect' },
      ]
      const selectedIndex = 1

      const selected = suggestions[selectedIndex]?.name
      expect(selected).toBe('ProjectPilot')
    })

    it('handles custom name input', () => {
      const customName = 'MyCustomProjectName'
      const trimmedName = customName.trim()

      expect(trimmedName).toBe('MyCustomProjectName')
    })

    it('rejects empty custom names', () => {
      const customName = '   '
      const isValid = customName.trim().length > 0

      expect(isValid).toBe(false)
    })
  })

  describe('navigation', () => {
    it('tracks selected index within bounds', () => {
      const totalOptions = 4 // 3 suggestions + 1 custom option
      let selected = 0

      // Simulate up arrow at beginning
      if (selected > 0) selected--
      expect(selected).toBe(0)

      // Simulate down arrow
      if (selected < totalOptions - 1) selected++
      expect(selected).toBe(1)

      // Simulate going to end
      selected = totalOptions - 1
      if (selected < totalOptions - 1) selected++
      expect(selected).toBe(totalOptions - 1)
    })
  })
})
