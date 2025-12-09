// Built-in advisor archetypes
import type { Advisor, AdvisorArchetype } from './types.ts'

// Default advisor definitions
export const DEFAULT_ARCHETYPES: Advisor[] = [
  {
    id: 'architect',
    name: 'The Architect',
    archetype: 'architect',
    personality:
      'Systematic, detail-oriented, focused on structure and scalability',
    keyGoal: 'Design robust, maintainable systems',
    focusAreas: [
      'System architecture',
      'Technical decisions',
      'Code structure',
      'Scalability',
    ],
  },
  {
    id: 'product_strategist',
    name: 'The Strategist',
    archetype: 'product_strategist',
    personality: 'Vision-driven, market-aware, focused on product-market fit',
    keyGoal: 'Ensure the product solves real problems for real users',
    focusAreas: [
      'Product vision',
      'Feature prioritization',
      'Market positioning',
      'User value',
    ],
  },
  {
    id: 'user_advocate',
    name: 'The Advocate',
    archetype: 'user_advocate',
    personality: 'Empathetic, user-focused, champions the end-user experience',
    keyGoal: "Ensure every decision considers the user's perspective",
    focusAreas: [
      'User experience',
      'Accessibility',
      'Usability',
      'User feedback',
    ],
  },
  {
    id: 'execution_lead',
    name: 'The Executor',
    archetype: 'execution_lead',
    personality: 'Action-oriented, deadline-focused, removes blockers',
    keyGoal: 'Keep the project moving forward with momentum',
    focusAreas: [
      'Task management',
      'Deadlines',
      'Blocker removal',
      'Progress tracking',
    ],
  },
  {
    id: 'researcher',
    name: 'The Researcher',
    archetype: 'researcher',
    personality: 'Curious, thorough, evidence-based decision maker',
    keyGoal: 'Ensure decisions are informed by data and research',
    focusAreas: [
      'Market research',
      'Competitive analysis',
      'User research',
      'Technical spikes',
    ],
  },
  {
    id: 'risk_skeptic',
    name: 'The Skeptic',
    archetype: 'risk_skeptic',
    personality: 'Cautious, analytical, identifies potential problems early',
    keyGoal: 'Surface risks before they become blockers',
    focusAreas: [
      'Risk assessment',
      'Edge cases',
      'Failure modes',
      'Contingency planning',
    ],
  },
  {
    id: 'scribe',
    name: 'The Scribe',
    archetype: 'scribe',
    personality: 'Organized, clear communicator, maintains project memory',
    keyGoal: 'Keep documentation clear, current, and useful',
    focusAreas: [
      'Documentation',
      'Decision records',
      'Meeting notes',
      'Knowledge management',
    ],
  },
  {
    id: 'growth',
    name: 'The Growth Lead',
    archetype: 'growth',
    personality: 'Metrics-driven, experimental, focused on sustainable growth',
    keyGoal: 'Identify and optimize growth levers',
    focusAreas: ['User acquisition', 'Retention', 'Metrics', 'Experimentation'],
  },
]

// Get archetype by name (case-insensitive)
export function getArchetypeByName(name: string): Advisor | undefined {
  const normalized = name.toLowerCase().trim()

  return DEFAULT_ARCHETYPES.find(
    (a) =>
      a.id === normalized ||
      a.name.toLowerCase() === normalized ||
      a.archetype === normalized ||
      a.name.toLowerCase().includes(normalized) ||
      normalized.includes(a.archetype),
  )
}

// Get all archetype names for display
export function getArchetypeDisplayList(): string[] {
  return DEFAULT_ARCHETYPES.map((a) => `${a.name} (${a.archetype})`)
}

// Get suggested archetypes based on project type (simple heuristic)
export function suggestArchetypes(projectType: string): AdvisorArchetype[] {
  const type = projectType.toLowerCase()

  // Default suggestions that work for most projects
  const base: AdvisorArchetype[] = [
    'architect',
    'product_strategist',
    'execution_lead',
  ]

  if (type.includes('game')) {
    return ['architect', 'user_advocate', 'execution_lead', 'scribe']
  }

  if (type.includes('saas') || type.includes('app')) {
    return ['architect', 'product_strategist', 'user_advocate', 'growth']
  }

  if (type.includes('research') || type.includes('study')) {
    return ['researcher', 'scribe', 'risk_skeptic']
  }

  if (type.includes('nonprofit') || type.includes('community')) {
    return ['product_strategist', 'user_advocate', 'scribe', 'execution_lead']
  }

  if (type.includes('automation') || type.includes('tool')) {
    return ['architect', 'user_advocate', 'risk_skeptic']
  }

  return base
}
