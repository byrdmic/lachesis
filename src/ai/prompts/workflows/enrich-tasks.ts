// Enrich tasks workflow prompt section

import { TASK_ENRICHMENT_STRUCTURE, TASK_CONTEXT_SOURCES } from '../fragments'

export function buildEnrichTasksSection(workflowFileContents: string, intent: string): string {
  return `
================================================================================
ACTIVE WORKFLOW: TASKS: ENRICH
================================================================================
Intent: ${intent}

You are enriching tasks in Tasks.md with context for Claude Code handoff.
Each task should become a self-contained work unit that another developer (or AI) can pick up and execute.

${TASK_CONTEXT_SOURCES}

${TASK_ENRICHMENT_STRUCTURE}

**TASKS TO SKIP:**
- Tasks that already have enrichment blocks (lines starting with > after the task)
- Completed tasks (checked checkbox: [x])
- Tasks where you cannot add meaningful context

**OUTPUT FORMAT (CRITICAL - OUTPUT ONLY JSON):**
Return ONLY a JSON object with this exact structure (no markdown, no explanation before or after):

\`\`\`json
{
  "enrichments": [
    {
      "originalTask": "- [ ] Implement user authentication [[Roadmap#VS2 - Auth System]]",
      "taskText": "Implement user authentication",
      "sliceLink": "[[Roadmap#VS2 - Auth System]]",
      "sourceComment": "<!-- from Log.md 2024-01-15 -->",
      "enrichment": {
        "why": "Users need secure access to their data; prerequisite for all personalized features",
        "considerations": [
          "OAuth vs email/password approach",
          "Session management and token refresh",
          "Rate limiting for security"
        ],
        "acceptance": [
          "User can sign up with email/password",
          "User can log in and log out",
          "Sessions persist across browser refresh"
        ],
        "constraints": [
          "Must support offline-first per Overview.md",
          "No external auth providers initially"
        ]
      },
      "confidenceScore": 0.9,
      "confidenceNote": "Rich context from Roadmap slice and Log entry"
    }
  ],
  "summary": {
    "tasksAnalyzed": 5,
    "tasksEnriched": 3,
    "tasksSkipped": 2,
    "skipReasons": ["Already has enrichment", "Completed task"]
  }
}
\`\`\`

**FIELD REQUIREMENTS:**
- originalTask: Required. The full task line including checkbox
- taskText: Required. Just the task description (without checkbox, links, comments)
- sliceLink: Optional. The [[Roadmap#VS...]] link if present
- sourceComment: Optional. The <!-- from ... --> comment if present
- enrichment.why: Required. 1-2 sentences on motivation
- enrichment.considerations: Required. 2-5 bullet points
- enrichment.acceptance: Required. Observable criteria for "done"
- enrichment.constraints: Optional. Only include if relevant constraints exist
- confidenceScore: Required. 0-1 based on how much context was available
- confidenceNote: Optional. Brief note on confidence level

**RULES:**
- Only enrich tasks that lack context (no existing > blocks)
- Prioritize Current section tasks over Later section
- Include confidence score (0-1) based on how much context was found
- Keep enrichments concise but complete (5-15 lines per task)
- Do NOT duplicate the task description - add NEW context only

FILE CONTENTS (for analysis):
${workflowFileContents}
================================================================================
`
}
