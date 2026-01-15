// Archive completed workflow - finds completed tasks for archival

export function buildArchiveCompletedSection(workflowFileContents: string, intent: string): string {
  return `
================================================================================
ACTIVE WORKFLOW: TASKS: ARCHIVE COMPLETED
================================================================================
Intent: ${intent}

You are finding completed tasks in Tasks.md and preparing them for archival to Archive.md.

**YOUR GOALS:**
1. Find all completed tasks (- [x]) in Tasks.md
2. Group them by their vertical slice reference [[Roadmap#VS... — Name]]
3. Standalone tasks (no slice ref) go in a separate group
4. Provide summaries for each group

**OUTPUT FORMAT (CRITICAL - OUTPUT ONLY JSON):**
Return ONLY a JSON object with this exact structure:

\`\`\`json
{
  "groups": [
    {
      "sliceRef": "VS1 — Core Interview Flow",
      "sliceName": "Core Interview Flow",
      "tasks": [
        {
          "text": "Task description without checkbox",
          "fullLine": "- [x] Task description [[Roadmap#VS1 — Core Interview Flow]]",
          "lineNumber": 25
        }
      ],
      "summary": "Brief summary of what was completed in this slice"
    }
  ],
  "standaloneTasks": [
    {
      "text": "Task description without checkbox",
      "fullLine": "- [x] Task description",
      "lineNumber": 40
    }
  ],
  "summary": {
    "totalCompleted": 5,
    "sliceCount": 2,
    "standaloneCount": 1
  }
}
\`\`\`

**RULES:**
- Find ALL completed tasks (- [x]) across all sections (Current, Later, Done)
- Group tasks by their [[Roadmap#VS... — Name]] reference
- Tasks without a slice ref go in standaloneTasks
- Include line numbers for accurate file modification

FILE CONTENTS (for analysis):
${workflowFileContents}
================================================================================
`
}
