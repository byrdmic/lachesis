// Log refine workflow - combined title + task extraction

export function buildLogRefineSection(workflowFileContents: string, intent: string): string {
  return `
================================================================================
ACTIVE WORKFLOW: LOG: REFINE (COMBINED)
================================================================================
Intent: ${intent}

You are refining Log.md in a single pass: adding titles to entries AND extracting potential tasks.

**YOUR GOALS:**
1. Find entries that lack titles (format: HH:MMam/pm with no " - " title after)
2. Add short, descriptive titles (1-5 words)
3. Extract 0-3 actionable tasks from each entry
4. Output ONE unified diff with all changes

**TITLE RULES:**
- Only add titles to entries that lack them
- Format: HH:MMam/pm - <Short Title>
- Titles should be 1-5 words, descriptive, scannable
- Use comma-separated titles for multiple topics (e.g., "11:48am - MCP Server, Diff Modal")

**TASK EXTRACTION RULES:**
- Extract 0-3 clearly actionable tasks from each entry
- If NO clearly actionable tasks exist, do NOT add a tasks section
- Tasks must be directly supported by the entry text - do NOT invent tasks
- Look for: "need to", "should", "TODO", "don't forget", "fix", "add", "refactor"

**IDEMPOTENCE RULES (CRITICAL):**
- If an entry already has a title (has " - " after time), DO NOT change it
- If an entry already has a "potential-tasks" section, DO NOT add another one

**POTENTIAL TASKS FORMAT (EXACT):**
\`\`\`
<!-- AI: potential-tasks start -->
#### Potential tasks (AI-generated)
- [ ] <task 1>
- [ ] <task 2>
<!-- AI: potential-tasks end -->
\`\`\`

**OUTPUT FORMAT:**
Output a SINGLE unified diff that includes BOTH title additions AND task extractions:

\`\`\`diff
--- Log.md
+++ Log.md
@@ -5,8 +5,14 @@
 ## 2024-01-15

-11:48am
+11:48am - MCP Server Setup
 I got the mcp server to actually work. Need to add it to the docker compose file
 and test the new endpoints. Also should document the configuration options.
+
+<!-- AI: potential-tasks start -->
+#### Potential tasks (AI-generated)
+- [ ] Add MCP server to docker compose
+- [ ] Test new endpoints
+- [ ] Document configuration options
+<!-- AI: potential-tasks end -->

 10:30am - Morning Planning
\`\`\`

RULES FOR DIFF OUTPUT:
• Use exact unified diff format with --- and +++ headers
• Include @@ line number markers
• CRITICAL: The "-" lines must show the ACTUAL current content
• Include 1-2 lines of context around each change
• Process ALL untitled entries in one diff
• After showing the diff, briefly explain what changes you made

FILE CONTENTS (for workflow execution):
${workflowFileContents}
================================================================================
`
}
