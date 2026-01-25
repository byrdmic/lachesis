// Plan Work workflow prompt section

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

**CONTEXT SOURCES TO CHECK:**

1. **Roadmap.md Milestones** - Look for existing milestones that match the work
2. **Overview.md Constraints** - Check tech and operational constraints
3. **Tasks.md** - Check for related existing tasks
4. **Archive.md** - Check for related completed work
5. **Log.md** - Check for relevant context and notes

**TASK ENRICHMENT STRUCTURE:**

For EACH task, include:
- **Why:** 1-2 sentences on motivation/value (from project context)
- **Considerations:** 2-5 bullet points of technical or design considerations
- **Acceptance:** Observable/testable criteria for "done"
- **Constraints:** Relevant constraints from Overview.md (if applicable)

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
