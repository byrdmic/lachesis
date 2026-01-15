// Init from summary workflow - batch fills Overview, Roadmap, Tasks from external summary

export function buildInitFromSummarySection(workflowFileContents: string, intent: string): string {
  return `
================================================================================
ACTIVE WORKFLOW: INITIALIZE FROM SUMMARY
================================================================================
Intent: ${intent}

The user is pasting a design summary from an external AI conversation or planning document.
Your job is to extract structured content and generate batch diffs for all three files.

**ANALYSIS PHASE (DO THIS FIRST)**

Read the summary carefully and identify:
1. Elevator pitch / one-liner - What is being built, for whom, and why?
2. Problem being solved - What pain point does this address?
3. Target users - Who will use this?
4. Value proposition - What's the main benefit vs alternatives?
5. Scope (in and out) - What's included and what's explicitly excluded?
6. Constraints (time, tech, money) - Any limitations?
7. Milestones / phases - Major deliverables or versions?
8. Features / vertical slices - Specific capabilities?
9. Specific tasks mentioned - Any action items?

**QUESTION POLICY (CRITICAL)**

Ask clarifying questions ONLY for genuine gaps or conflicts:
- Missing elevator pitch (you can't determine what this project is)
- No clear MVP scope (no way to determine the first milestone)
- Conflicting information (summary says X but also contradicts with Y)
- Completely missing target users (no idea who this is for)

Do NOT ask about:
- Formatting preferences
- Order of sections
- Things that can be reasonably inferred from context
- Minor details that don't block file generation
- Style choices (naming conventions, etc.)

**IMPORTANT: If the summary contains enough information to fill the files meaningfully,
generate diffs immediately WITHOUT asking questions first. Err on the side of generating
diffs rather than asking questions.**

**OUTPUT FORMAT (CRITICAL)**

Generate THREE diff blocks in this exact order:

1. Overview.md diff
2. Roadmap.md diff
3. Tasks.md diff

Each diff block must:
- Have proper --- and +++ headers
- Show the actual current file content in - lines
- Show the new content in + lines
- Include context lines (lines starting with space)

Example structure:
\`\`\`diff
--- Overview.md
+++ Overview.md
@@ -5,7 +5,15 @@
 ## Elevator Pitch

-<!-- Brief project summary -->
+[Extracted elevator pitch from summary - what, for whom, why it matters]

 ## Problem Statement

-<!-- What problem does this solve? -->
+**Current pain:** [What hurts today]
+**Root cause:** [Why it hurts]
+**Consequence:** [What happens if unsolved]
\`\`\`

\`\`\`diff
--- Roadmap.md
+++ Roadmap.md
@@ -10,15 +10,45 @@
 ## Milestones

-### M1 — [First Milestone Name]
+### M1 — [MVP Milestone Name]
+**Status:** active
+**Why it matters:** [Why this is the MVP]
+**Outcome:** [What users can do after this milestone]

-<!-- Add milestones -->
+**Definition of Done (observable)**
+- [Observable criteria 1]
+- [Observable criteria 2]
+
+**Links**
+- Tasks: [[Tasks]]
+
+#### Slices
+
+##### VS1 — [Slice Name]
+- **Purpose:** [Why this slice exists — the user need or gap it addresses]
+- **Delivers:** [What capability or feature the user gets when this is done]
+- **Solves:** [What problem or friction this removes]
+
+##### VS2 — [Slice Name]
+- **Purpose:** [Why this slice exists]
+- **Delivers:** [What it provides]
+- **Solves:** [What problem it addresses]
\`\`\`

\`\`\`diff
--- Tasks.md
+++ Tasks.md
@@ -5,15 +5,15 @@
 ## Current
-- [ ] <Task you're actively working on> [[Roadmap#VS1 — <Slice Name>]]
-- [ ] <Task ready to start> [[Roadmap#VS1 — <Slice Name>]]
-- [ ] <Standalone task>
+- [ ] [Task from summary] [[Roadmap#VS1 — Slice Name]]
+- [ ] [Task from summary] [[Roadmap#VS2 — Slice Name]]

 ---

 ## Blocked
 - [ ] <Thing blocked> — waiting on <dependency> — unblock plan: <...>

 ---

 ## Later
 - [ ] <Task>
 - [ ] <Task>

 ---

 ## Done
 - [x] <Item> (details in [[Archive]])
\`\`\`

Note: The diff shows that only the Current section gets real tasks. Blocked, Later, and Done sections remain as template placeholders. The file ends with Done - nothing follows it.

**FRONTMATTER STRUCTURE (CRITICAL - READ CAREFULLY)**

All three files use YAML frontmatter. For Obsidian to parse frontmatter correctly:
1. The file MUST start with \`---\` on line 1 (nothing before it, not even whitespace)
2. Frontmatter content follows (schema_version, doc_type, project info, etc.)
3. Frontmatter ends with \`---\` on its own line
4. The markdown title (e.g., \`# Tasks — Project Name\`) comes AFTER the frontmatter

**WRONG** (frontmatter will show as visible text):
\`\`\`markdown
# Tasks — My Project

---
schema_version: 2
doc_type: tasks
---
\`\`\`

**CORRECT** (frontmatter will be parsed):
\`\`\`markdown
---
schema_version: 2
doc_type: tasks
project:
  id: "20260115-my-project"
  name: "My Project"
  status: active
...
---

# Tasks — My Project
\`\`\`

When generating diffs, NEVER put a title or any content before the opening \`---\`.
If updating content in the body, make sure the diff context shows the frontmatter is preserved.

**CONTENT MAPPING RULES**

Overview.md:
- Elevator Pitch: 1-3 sentences capturing what + who + why
- Problem Statement: Current pain, root cause, consequence if unsolved
- Target Users: Primary users, context of use, non-users
- Value Proposition: Main benefit, differentiator vs alternatives
- Scope: In-scope items (bullet list), Out-of-scope / Anti-goals (bullet list)
- Constraints: Time, tech, money, operational (if mentioned)

Roadmap.md:
- M1 is always MVP - the smallest version that proves this works
- Each milestone needs: status, why it matters, outcome, observable Definition of Done
- Milestones must be vertical (demo-able), not horizontal (layers/components)
- Vertical slices nested under each milestone as #### Slices section
- Slices are 1-5 days of work, demo-able, end-to-end
- Each slice needs: **VS# — Name** with Purpose, Delivers, and Solves fields
- Purpose: Why this slice exists (user need or gap)
- Delivers: What capability/feature the user gets
- Solves: What problem or friction this removes
- Set M1 Status to "active" to indicate current work, other milestones to "planned"

Tasks.md:
- Extract tasks from the summary that map to slices
- Link tasks using [[Roadmap#VS1 — Slice Name]]
- Tasks should be 15-60 minutes, concrete, with clear acceptance criteria
- Standalone tasks (no slice link) are valid for misc items
- Place tasks in the Current section
- Do NOT invent tasks - only extract from the provided summary
- **CRITICAL - No duplication:**
  - Each task appears EXACTLY ONCE in the file
  - Only modify the Current section with extracted tasks
  - Blocked, Later, and Done sections should keep their template placeholders
  - Done section should remain as: \`- [x] <Item> (details in [[Archive]])\`
  - The file ends with the Done section - no content should follow it
  - NEVER repeat tasks after the Done heading

**RULES:**
- Generate all three diffs in a single response when possible
- If you must ask questions, ask them all at once (not one at a time)
- After getting answers, generate diffs immediately
- Never ask for the summary again - it's in the conversation

FILE CONTENTS (current state):
${workflowFileContents}
================================================================================
`
}
