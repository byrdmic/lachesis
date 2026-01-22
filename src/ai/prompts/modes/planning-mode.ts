// Planning Mode Prompt Builder
// Structured conversation rules for milestone brainstorming

/**
 * Build the planning mode section for the system prompt.
 * This guides the AI through a structured discovery → analysis → proposals flow.
 */
export function buildPlanningModeSection(): string {
  return `
================================================================================
PLANNING MODE
================================================================================

You are helping the user plan their next milestones. This is a brainstorming
session, not a task execution workflow.

APPROACH:

1. DISCOVERY (ask 2-4 focused questions):
   - What has been accomplished recently? (reference Archive.md)
   - What is current energy/focus?
   - Any blockers or concerns?
   - Timeline thinking? (next week, month, quarter?)

2. ANALYSIS (synthesize before proposing):
   - Review Roadmap.md progress
   - Check Ideas.md for deferred work that might be ready
   - Consider project constraints from Overview.md

3. PROPOSALS (when user signals readiness):
   Output 2-4 concrete milestones:

   ### Milestone Proposals

   **M[N] — [Name]**
   - **Rationale**: Why this milestone now
   - **Delivers**: 2-4 key outcomes
   - **First slice**: One concrete starting point

   ---
   *Say "save to Ideas" or "add to Roadmap" to capture these.*

RULES:
- Do NOT jump to proposals immediately - gather context first
- Keep questions conversational, not checklist-like
- Proposals should be achievable, demo-able outcomes
- Reference existing project content when relevant

TRIGGER PHRASES:
- "show milestones", "I'm ready", "what do you suggest" → output proposals
- "save to ideas" → signal for UI to write to Ideas.md
- "add to roadmap" → signal for UI to write to Roadmap.md
================================================================================
`
}

/**
 * Trigger phrases that indicate the user wants to see milestone proposals.
 */
export const PLANNING_PROPOSAL_TRIGGERS = [
  'show milestones',
  "i'm ready",
  'im ready',
  'what do you suggest',
  'show proposals',
  'give me options',
  'what should i work on',
  'what next',
]

/**
 * Trigger phrases that indicate the user wants to save proposals to Ideas.md.
 */
export const PLANNING_SAVE_IDEAS_TRIGGERS = [
  'save to ideas',
  'save ideas',
  'add to ideas',
]

/**
 * Trigger phrases that indicate the user wants to add proposals to Roadmap.md.
 */
export const PLANNING_ADD_ROADMAP_TRIGGERS = [
  'add to roadmap',
  'save to roadmap',
  'add roadmap',
]

/**
 * Check if user input contains a trigger phrase.
 */
export function detectPlanningTrigger(
  input: string
): 'proposals' | 'save_ideas' | 'add_roadmap' | null {
  const normalized = input.toLowerCase().trim()

  for (const trigger of PLANNING_SAVE_IDEAS_TRIGGERS) {
    if (normalized.includes(trigger)) {
      return 'save_ideas'
    }
  }

  for (const trigger of PLANNING_ADD_ROADMAP_TRIGGERS) {
    if (normalized.includes(trigger)) {
      return 'add_roadmap'
    }
  }

  for (const trigger of PLANNING_PROPOSAL_TRIGGERS) {
    if (normalized.includes(trigger)) {
      return 'proposals'
    }
  }

  return null
}

/**
 * Check if user input suggests they want to enter planning mode.
 */
export function detectPlanningModeRequest(input: string): boolean {
  const normalized = input.toLowerCase().trim()
  const planningPhrases = [
    'help me plan',
    "what's next",
    'whats next',
    'what should i do next',
    'plan my next',
    'brainstorm',
    'planning mode',
    'enter planning',
    'start planning',
  ]

  return planningPhrases.some((phrase) => normalized.includes(phrase))
}

/**
 * Extract milestone proposals from AI response.
 * Returns the proposals section if found.
 */
export function extractMilestoneProposals(content: string): string | null {
  // Look for the "### Milestone Proposals" section
  const proposalMatch = content.match(
    /### Milestone Proposals\s*([\s\S]*?)(?=\n---\s*\*Say|$)/i
  )

  if (proposalMatch) {
    return proposalMatch[1].trim()
  }

  // Alternative: look for multiple M[N] patterns
  const milestonePattern = /\*\*M\d+\s*[—–-]\s*[^*]+\*\*/g
  const milestones = content.match(milestonePattern)

  if (milestones && milestones.length >= 2) {
    // Extract the section containing the milestones
    const firstIndex = content.indexOf(milestones[0])
    const lastIndex = content.lastIndexOf(milestones[milestones.length - 1])
    const endIndex = content.indexOf('\n---', lastIndex)

    return content
      .slice(firstIndex, endIndex > lastIndex ? endIndex : undefined)
      .trim()
  }

  return null
}
