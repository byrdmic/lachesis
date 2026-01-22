// Prompts module - public API

export { buildSystemPrompt } from './build-system-prompt'
export type { SystemPromptOptions, ChatMode } from './types'
export { DISCOVERY_TOPICS, type DiscoveryTopic } from './constants'
export {
  detectPlanningTrigger,
  detectPlanningModeRequest,
  extractMilestoneProposals,
} from './modes'
