// Plan Work workflow prompt section

import { TASK_CREATION_GUIDANCE, TASK_ENRICHMENT_STRUCTURE, TASK_CONTEXT_SOURCES } from '../fragments'

export function buildPlanWorkSection(workflowFileContents: string, intent: string): string {
  return `
================================================================================
ACTIVE WORKFLOW: PLAN WORK
================================================================================
Intent: ${intent}

You are generating enriched tasks based on a user's work description.
Your goal is to create self-contained task definitions ready for AI handoff (Claude Code, etc.).

**YOUR PROCESS:**

1. **Understand the Request** - Parse what the user wants to accomplish
2. **Check Existing Context** - Review Roadmap for relevant milestones, Tasks for overlaps
3. **Generate Tasks** - Create 1-5 actionable tasks with full enrichment

${TASK_CONTEXT_SOURCES}

${TASK_CREATION_GUIDANCE}

${TASK_ENRICHMENT_STRUCTURE}

**OUTPUT FORMAT (CRITICAL - OUTPUT ONLY JSON):**
Return ONLY a JSON object with this exact structure (no markdown, no explanation before or after):

\`\`\`json
{
  "tasks": [
    {
      "text": "Implement OAuth 2.0 provider integration",
      "enrichment": {
        "why": "Users need secure third-party authentication for seamless login experience",
        "considerations": [
          "Support Google and GitHub as initial providers",
          "Token storage and refresh handling",
          "Error handling for provider outages"
        ],
        "acceptance": [
          "User can sign in with Google",
          "User can sign in with GitHub",
          "Tokens persist and refresh correctly"
        ],
        "constraints": [
          "Must work offline after initial auth per Overview.md"
        ]
      }
    }
  ],
  "summary": {
    "tasksGenerated": 3,
    "notes": "Tasks focus on MVP auth flow; advanced features for later"
  }
}
\`\`\`

**FIELD REQUIREMENTS:**
- tasks[].text: Required. Clear, actionable task description
- tasks[].enrichment.why: Required. 1-2 sentences on motivation
- tasks[].enrichment.considerations: Required. 2-5 bullet points
- tasks[].enrichment.acceptance: Required. Observable criteria for "done"
- tasks[].enrichment.constraints: Optional. Only include if relevant

**RULES:**
- Generate 1-5 focused tasks (prefer fewer, well-defined tasks over many vague ones)
- Each task should be actionable in 1-5 days
- Include constraints in enrichment ONLY when directly relevant
- Keep enrichment concise - enough context for handoff, not a design doc

FILE CONTENTS (for context):
${workflowFileContents}
================================================================================
`
}
