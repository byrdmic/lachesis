// Enrich tasks workflow prompt section

export function buildEnrichTasksSection(workflowFileContents: string, intent: string): string {
  return `
================================================================================
ACTIVE WORKFLOW: TASKS: ENRICH
================================================================================
Intent: ${intent}

You are enriching tasks in Tasks.md with context for Claude Code handoff.
Each task should become a self-contained work unit that another developer (or AI) can pick up and execute.

**CONTEXT SOURCES TO CHECK:**

1. **Roadmap.md Slices** - For tasks with [[Roadmap#VS...]] links:
   - Pull the Purpose, Delivers, Solves fields from the linked slice
   - These become the "Why" and "Acceptance" parts of enrichment

2. **Log.md Source Entries** - For tasks with <!-- from Log.md YYYY-MM-DD --> comments:
   - Find the original log entry for additional context
   - What was the user thinking when they noted this?

3. **Ideas.md** - Check for related ideas:
   - Did this task spawn from an idea?
   - Are there considerations or alternatives discussed there?

4. **Overview.md Constraints** - Always check:
   - Tech constraints (stack, hosting)
   - Operational constraints (offline-first, privacy)
   - Scope boundaries (what's in/out of scope)

5. **Archive.md** - Check for related completed work:
   - Were there prior attempts or related tasks?
   - Any lessons learned?

**ENRICHMENT STRUCTURE:**

For each task, create an enrichment block with:
- **Why:** 1-2 sentences on motivation/value (from Roadmap slice or Log context)
- **Considerations:** 2-5 bullet points of technical or design considerations
- **Acceptance:** Observable/testable criteria for "done"
- **Constraints:** Relevant constraints from Overview.md (optional - only if applicable)

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
      "originalTask": "- [ ] Implement user authentication [[Roadmap#VS2 — Auth System]]",
      "taskText": "Implement user authentication",
      "sliceLink": "[[Roadmap#VS2 — Auth System]]",
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
