// Harvest tasks workflows - includes tasks-harvest, harvest-tasks, and ideas-groom

export function buildTasksHarvestSection(workflowFileContents: string, intent: string): string {
  return `
================================================================================
ACTIVE WORKFLOW: TASKS: HARVEST (COMBINED)
================================================================================
Intent: ${intent}

You are scanning ALL project files to find actionable work that should become tasks.
This includes Ideas.md which should be processed by ## heading sections.

**YOUR GOALS:**
1. Find implicit TODOs and action items in Log.md and Ideas.md
2. Identify gaps between Roadmap milestones and current Tasks.md
3. De-duplicate against existing tasks in Tasks.md
4. Suggest appropriate destinations for each item

**WHAT TO LOOK FOR:**

In Log.md:
- Phrases like "need to", "should", "TODO", "don't forget", "fix", "add", "refactor"
- Blockers mentioned that need resolution
- Decisions that imply follow-up work

In Ideas.md (IMPORTANT - process by heading):
- Each ## heading represents a discrete idea
- Ideas with clear action verbs or specific outcomes are good candidates
- Include the ideaHeading field for context
- Skip vague musings, pure questions, or brainstorming notes

In Overview.md / Roadmap.md:
- Gaps between stated goals and current tasks
- Success criteria not yet addressed
- Constraints that need implementation

**WHAT TO SKIP:**
- Items already in Tasks.md (check task descriptions for matches)
- Vague musings ("maybe we could...")
- Questions without clear paths forward
- Completed work mentioned in Archive.md context

**OUTPUT FORMAT (CRITICAL - OUTPUT ONLY JSON):**
Return ONLY a JSON object with this exact structure (no markdown, no explanation before or after):

\`\`\`json
{
  "tasks": [
    {
      "text": "Concise, actionable task description",
      "sourceFile": "Log.md",
      "sourceContext": "Brief quote from source (max 100 chars)",
      "sourceDate": "2024-01-15",
      "ideaHeading": null,
      "suggestedDestination": "later",
      "suggestedSliceLink": null,
      "reasoning": "Why this is actionable (1 sentence)",
      "existingSimilar": null
    },
    {
      "text": "Task extracted from Ideas.md",
      "sourceFile": "Ideas.md",
      "sourceContext": "Brief description under the idea heading",
      "sourceDate": null,
      "ideaHeading": "## Original Idea Heading",
      "suggestedDestination": "next",
      "suggestedSliceLink": "[[Roadmap#VS1 — Feature Name]]",
      "reasoning": "Why this idea is now actionable",
      "existingSimilar": null
    }
  ],
  "summary": {
    "totalFound": 5,
    "fromLog": 3,
    "fromIdeas": 2,
    "fromOther": 0,
    "duplicatesSkipped": 2
  }
}
\`\`\`

**DESTINATION OPTIONS:**
- "discard": Not actually actionable or already done
- "later": Actionable but not urgent, add to Later section
- "current": Add to Current section (with optional slice link)

**FIELD REQUIREMENTS:**
- text: Required. Concise task description (1-2 sentences max)
- sourceFile: Required. Which file this came from (Log.md, Ideas.md, Overview.md, Roadmap.md)
- sourceContext: Required. Brief quote showing where you found this
- sourceDate: Optional. Date if from Log.md (format: YYYY-MM-DD)
- ideaHeading: Include when sourceFile is Ideas.md - the ## heading this came from
- suggestedDestination: Required. One of the destination options above
- suggestedSliceLink: Optional. If this task relates to a Roadmap slice
- reasoning: Required. Why this is actionable
- existingSimilar: Optional. If you found a similar existing task, note it here

FILE CONTENTS (for analysis):
${workflowFileContents}
================================================================================
`
}

export function buildHarvestTasksSection(workflowFileContents: string, intent: string): string {
  return `
================================================================================
ACTIVE WORKFLOW: TASKS: HARVEST TASKS
================================================================================
Intent: ${intent}

You are scanning ALL project files to find actionable work that should become tasks.

**YOUR GOALS:**
1. Find implicit TODOs and action items in Log.md and Ideas.md
2. Identify gaps between Roadmap milestones and current Tasks.md
3. De-duplicate against existing tasks in Tasks.md
4. Suggest appropriate destinations for each item

**WHAT TO LOOK FOR:**

In Log.md:
- Phrases like "need to", "should", "TODO", "don't forget", "fix", "add", "refactor"
- Blockers mentioned that need resolution
- Decisions that imply follow-up work

In Ideas.md:
- Concrete ideas that are ready to become tasks (not vague)
- Questions that have clear answers and lead to action

In Overview.md / Roadmap.md:
- Gaps between stated goals and current tasks
- Success criteria not yet addressed
- Constraints that need implementation

**WHAT TO SKIP:**
- Items already in Tasks.md (check task descriptions for matches)
- Vague musings ("maybe we could...")
- Questions without clear paths forward
- Completed work mentioned in Archive.md context

**OUTPUT FORMAT (CRITICAL - OUTPUT ONLY JSON):**
Return ONLY a JSON object with this exact structure (no markdown, no explanation before or after):

\`\`\`json
{
  "tasks": [
    {
      "text": "Concise, actionable task description",
      "sourceFile": "Log.md",
      "sourceContext": "Brief quote from source (max 100 chars)",
      "sourceDate": "2024-01-15",
      "suggestedDestination": "later",
      "suggestedVSName": null,
      "reasoning": "Why this is actionable (1 sentence)",
      "existingSimilar": null
    }
  ],
  "summary": {
    "totalFound": 5,
    "fromLog": 3,
    "fromIdeas": 2,
    "fromOther": 0,
    "duplicatesSkipped": 2
  }
}
\`\`\`

**DESTINATION OPTIONS:**
- "discard": Not actually actionable or already done
- "later": Actionable but not urgent, add to Later section
- "current": Add to Current section (with optional slice link)

**FIELD REQUIREMENTS:**
- text: Required. Concise task description (1-2 sentences max)
- sourceFile: Required. Which file this came from (Log.md, Ideas.md, Overview.md, Roadmap.md)
- sourceContext: Required. Brief quote showing where you found this (helps user verify)
- sourceDate: Optional. Date if from Log.md (format: YYYY-MM-DD)
- suggestedDestination: Required. One of the destination options above
- suggestedSliceLink: Optional. If this task relates to a Roadmap slice, suggest the link (e.g., "[[Roadmap#VS1 — Basic Modal Opens]]")
- reasoning: Required. Why this is actionable
- existingSimilar: Optional. If you found a similar existing task, note it here

FILE CONTENTS (for analysis):
${workflowFileContents}
================================================================================
`
}

export function buildIdeasGroomSection(workflowFileContents: string, intent: string): string {
  return `
================================================================================
ACTIVE WORKFLOW: IDEAS: GROOM TASKS
================================================================================
Intent: ${intent}

You are scanning Ideas.md to find actionable items that should become tasks.

**YOUR GOALS:**
1. Find ideas in Ideas.md that are concrete and actionable
2. Ideas are typically grouped by ## headings with optional descriptions underneath
3. De-duplicate against existing tasks in Tasks.md
4. Suggest appropriate destinations for each item

**WHAT TO LOOK FOR:**

In Ideas.md:
- ## section headings that represent discrete ideas
- Ideas with clear action verbs or specific outcomes
- Bullet points under headings that contain actionable items
- Ideas that have matured enough to become tasks

**WHAT TO SKIP:**
- Items already in Tasks.md (check task descriptions for matches)
- Vague musings ("maybe we could...", "what if...")
- Pure questions in the Open Questions section without clear paths forward
- Brainstorming notes that are still too raw

**OUTPUT FORMAT (CRITICAL - OUTPUT ONLY JSON):**
Return ONLY a JSON object with this exact structure (no markdown, no explanation before or after):

\`\`\`json
{
  "tasks": [
    {
      "text": "Concise, actionable task description",
      "ideaHeading": "## Original Idea Heading",
      "ideaContext": "Brief description or notes from the idea (max 150 chars)",
      "suggestedDestination": "later",
      "suggestedSliceLink": null,
      "reasoning": "Why this idea is now actionable (1 sentence)",
      "existingSimilar": null
    }
  ],
  "summary": {
    "totalFound": 5,
    "ideasProcessed": 10,
    "duplicatesSkipped": 2
  }
}
\`\`\`

**DESTINATION OPTIONS:**
- "discard": Not actually actionable or already done
- "later": Actionable but not urgent, add to Later section
- "current": Add to Current section (with optional slice link)

**FIELD REQUIREMENTS:**
- text: Required. Concise task description (1-2 sentences max)
- ideaHeading: Required. The ## heading this task came from
- ideaContext: Optional. Brief description or notes from the idea section
- suggestedDestination: Required. One of the destination options above
- suggestedSliceLink: Optional. If this task relates to a Roadmap slice, suggest the link (e.g., "[[Roadmap#VS1 — Basic Modal Opens]]")
- reasoning: Required. Why this idea is now actionable
- existingSimilar: Optional. If you found a similar existing task, note it here

FILE CONTENTS (for analysis):
${workflowFileContents}
================================================================================
`
}
