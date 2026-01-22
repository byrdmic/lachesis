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
2. **Check Existing Context** - Review Roadmap for relevant slices, Tasks for overlaps
3. **Generate Tasks** - Create 1-5 actionable tasks with full enrichment
4. **Suggest Roadmap Updates** - If new features identified, suggest new slices

**CONTEXT SOURCES TO CHECK:**

1. **Roadmap.md Slices** - Look for existing slices that match the work:
   - Find slices by name/purpose that relate to the work description
   - If a matching slice exists, tasks should link to it: [[Roadmap#VS1 — Slice Name]]
   - Note the slice's Purpose, Delivers, Solves fields for task enrichment

2. **Overview.md Constraints** - Always check:
   - Tech constraints (stack, hosting, dependencies)
   - Operational constraints (offline-first, privacy, performance)
   - Scope boundaries (what's explicitly in/out of scope)

3. **Tasks.md** - Check for related existing tasks:
   - Avoid duplicating work that's already planned
   - Note dependencies between new and existing tasks

4. **Archive.md** - Check for related completed work:
   - Understand what's already been done in this area
   - Learn from any prior approaches

5. **Log.md** - Check for relevant context:
   - Recent thinking or notes about this area
   - Problems or considerations the user has noted

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
      "sliceLink": "[[Roadmap#VS2 — Auth System]]",
      "isNewSlice": false,
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
  "newSlices": [
    {
      "id": "VS5",
      "name": "OAuth Integration",
      "milestone": "M2 — User Experience",
      "purpose": "Enable secure third-party authentication",
      "delivers": "Google and GitHub OAuth login flows",
      "solves": "Users need quick, secure account access without password management"
    }
  ],
  "summary": {
    "tasksGenerated": 3,
    "existingSlicesLinked": 1,
    "newSlicesSuggested": 1,
    "notes": "Tasks focus on MVP auth flow; advanced features for later"
  }
}
\`\`\`

**FIELD REQUIREMENTS:**
- tasks[].text: Required. Clear, actionable task description
- tasks[].sliceLink: Optional. Link to existing or new Roadmap slice
- tasks[].isNewSlice: Required. True if sliceLink refers to a suggested new slice
- tasks[].enrichment.why: Required. 1-2 sentences on motivation
- tasks[].enrichment.considerations: Required. 2-5 bullet points
- tasks[].enrichment.acceptance: Required. Observable criteria for "done"
- tasks[].enrichment.constraints: Optional. Only include if relevant
- newSlices: Optional array. Include only if new slices are suggested
- newSlices[].id: Required. Suggested VS number (check existing for next available)
- newSlices[].name: Required. Short descriptive name
- newSlices[].milestone: Optional. Which milestone this belongs under
- newSlices[].purpose: Required. Why this slice exists
- newSlices[].delivers: Required. What outcomes this slice produces
- newSlices[].solves: Required. What problem this addresses

**RULES:**
- Generate 1-5 focused tasks (prefer fewer, well-defined tasks over many vague ones)
- Each task should be actionable in 1-5 days
- Link to existing slices when work clearly belongs to them
- Suggest new slices only when work represents a genuinely new feature area
- Include constraints in enrichment ONLY when directly relevant
- Keep enrichment concise - enough context for handoff, not a design doc

FILE CONTENTS (for context):
${workflowFileContents}
================================================================================
`
}
