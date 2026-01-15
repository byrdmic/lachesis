// Constants and helpers for system prompts

import type { PlanningLevel } from '../../core/project/types'

export const DISCOVERY_TOPICS = [
  'elevator_pitch',
  'problem_statement',
  'target_users',
  'value_proposition',
  'scope_and_antigoals',
  'constraints',
] as const

export type DiscoveryTopic = (typeof DISCOVERY_TOPICS)[number]

export function getTimeGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) {
    return 'Good morning, sir'
  } else if (hour >= 12 && hour < 17) {
    return 'Good afternoon, sir'
  } else {
    return 'Good evening, sir'
  }
}

export function getPlanningContext(level: PlanningLevel): string {
  const lower = level.toLowerCase()
  if (lower.includes('vague') || lower.includes('spark') || lower === 'light') {
    return `They have a light/vague idea. Help them articulate what they're imagining. Ask clarifying questions and avoid assuming details.`
  }
  if (lower.includes('well') || lower.includes('defined') || lower === 'heavy') {
    return `They say this is well defined. Validate their thinking and probe edge cases or assumptions they might have missed.`
  }
  if (lower.includes('note') || lower.includes('partial') || lower === 'medium') {
    return `They have some notes/partial thoughts. Build on what they know, ask what they've figured out, then fill gaps.`
  }
  return `Planning state is freeform: "${level}". Mirror their phrasing, ask a quick clarifier if needed, then proceed.`
}
