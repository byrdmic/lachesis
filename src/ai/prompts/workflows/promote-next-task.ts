// Promote next task workflow - selects best task to promote from Later to Current

export function buildPromoteNextTaskSection(workflowFileContents: string, intent: string): string {
  return `
================================================================================
ACTIVE WORKFLOW: TASKS: PROMOTE TO CURRENT
================================================================================
Intent: ${intent}

You are selecting the best task to promote from Later to the Current section.

**PRE-CHECK (DO THIS FIRST)**
1. Check if the Current section in Tasks.md has tasks (- [ ])
2. The workflow can still run even if Current has tasks (to add more from Later)
3. If Later section is empty, output:
   \`\`\`json
   {
     "status": "no_tasks",
     "message": "No tasks available to promote. Later section is empty."
   }
   \`\`\`

**SELECTION CRITERIA (IN PRIORITY ORDER)**
1. **Roadmap Alignment**: Tasks linked to the active milestone (Status: active) score highest
2. **Slice Linkage**: Tasks with [[Roadmap#VS... — Name]] links that match active slices
3. **Unblocking Value**: Small tasks that unblock other work (dependencies)
4. **Standalone Quick Wins**: Small, concrete tasks without dependencies
5. **Strategic Importance**: Tasks that advance MVP goals

**EVALUATION PROCESS**
For each candidate task in Later:
- Extract the slice link if present (e.g., [[Roadmap#VS1 — Core Interview Flow]])
- Check if the slice's milestone has Status: active in Roadmap.md
- Consider if the task description suggests it unblocks other work
- Score: 1 (low priority) to 5 (high priority)

**OUTPUT FORMAT (SUCCESS CASE)**
\`\`\`json
{
  "status": "success",
  "selectedTask": {
    "text": "Exact task text from Tasks.md (without checkbox)",
    "sliceLink": "[[Roadmap#VS1 — Core Interview Flow]]"
  },
  "reasoning": "1-2 sentences explaining why this task was selected",
  "candidates": [
    {
      "text": "Another task that was considered",
      "sliceLink": null,
      "score": 3,
      "note": "Good task but not aligned with active milestone"
    }
  ]
}
\`\`\`

**FIELD REQUIREMENTS:**
- status: Required. One of: "success", "no_tasks"
- selectedTask.text: Required for success. The exact task text (without "- [ ]" prefix)
- selectedTask.sliceLink: Optional. The [[Roadmap#...]] link if present
- reasoning: Required for success. Brief explanation of selection
- candidates: Required for success. List of other tasks considered (can be empty array)
- Each candidate needs: text, sliceLink (or null), score (1-5), note

FILE CONTENTS (for analysis):
${workflowFileContents}
================================================================================
`
}
