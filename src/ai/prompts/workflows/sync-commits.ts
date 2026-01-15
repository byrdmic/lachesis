// Sync commits workflow - matches git commits to tasks

export function buildSyncCommitsSection(workflowFileContents: string, intent: string): string {
  return `
================================================================================
ACTIVE WORKFLOW: TASKS: SYNC COMMITS
================================================================================
Intent: ${intent}

You are analyzing recent git commits to find which tasks have been completed.

**YOUR GOALS:**
1. Match commits to unchecked tasks (- [ ]) in Tasks.md
2. Assign confidence levels to each match
3. Identify commits that don't match any task

**WHAT TO LOOK FOR:**

In commit messages:
- Keywords that match task descriptions
- References to features, slices, or specific implementations
- Bug fixes that correspond to known issues
- Feature names mentioned in both commit and task

In Tasks.md:
- Unchecked tasks (- [ ]) in any section (Current, Later)
- Task descriptions and acceptance criteria
- Slice links that might relate to commits (e.g., [[Roadmap#VS1 — Feature Name]])

**CONFIDENCE LEVELS:**
- "high": Direct match - commit explicitly addresses the task (same keywords, feature name, or explicit reference)
- "medium": Semantic match - commit is related but not explicit (similar domain, related functionality)
- "low": Possible match - some overlap but uncertain (tangentially related)

**MATCHING GUIDELINES:**
- Look for overlapping keywords between commit message and task text
- Consider the commit body for additional context (often contains detailed explanations)
- A commit fixing "authentication flow" likely matches task "Fix auth endpoint"
- A commit "Add dark mode toggle" matches task "Implement dark mode setting"
- Don't match if the relationship is too tenuous

**OUTPUT FORMAT (CRITICAL - OUTPUT ONLY JSON):**
Return ONLY a JSON object with this exact structure (no markdown, no explanation before or after):

\`\`\`json
{
  "matches": [
    {
      "commitSha": "abc1234def5678",
      "commitMessage": "Full commit message including title and body",
      "taskText": "Exact task text from Tasks.md",
      "taskSection": "next",
      "confidence": "high",
      "reasoning": "Why this commit matches this task (1-2 sentences)"
    }
  ],
  "unmatchedCommits": [
    {
      "commitSha": "xyz9876abc5432",
      "commitMessage": "Commit title here",
      "reasoning": "Why no task matches - e.g., maintenance work, refactoring, or no corresponding task exists"
    }
  ],
  "summary": {
    "totalCommits": 10,
    "matchedCount": 3,
    "unmatchedCount": 7
  }
}
\`\`\`

**TASK SECTION VALUES:**
- "current": From "Current" section (active tasks)
- "later": From "Later" section (backlog)

**FIELD REQUIREMENTS:**
- commitSha: Required. Full commit SHA
- commitMessage: Required. Full commit message (title + body if available)
- taskText: Required. Exact task text as it appears in Tasks.md (without the checkbox)
- taskSection: Required. Which section the task is in
- confidence: Required. One of: "high", "medium", "low"
- reasoning: Required. Why this commit matches (for matches) or why no match exists (for unmatched)

**IMPORTANT RULES:**
- Do NOT match commits to already-completed tasks (- [x])
- Do NOT invent matches - only match if there is clear evidence
- One commit can match multiple tasks (if it addresses several items)
- One task should generally only match one commit
- Include ALL commits in either matches or unmatchedCommits

FILE CONTENTS (for analysis):
${workflowFileContents}
================================================================================
`
}
