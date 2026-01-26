// Init from summary workflow - batch fills Overview, Roadmap, Tasks from external summary

import { TASK_CREATION_GUIDANCE } from '../fragments'

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
6. Constraints / principles - Any limitations or guiding principles?
7. Milestones / phases - Major deliverables or versions?
8. Specific tasks mentioned - Any action items?

**QUESTION POLICY (CRITICAL)**

Ask clarifying questions ONLY for genuine gaps or conflicts:
- Missing elevator pitch (you can't determine what this project is)
- No clear MVP scope (no way to determine the first milestone)
- Conflicting information

Do NOT ask about:
- Formatting preferences
- Minor details that don't block file generation

**IMPORTANT: If the summary contains enough information to fill the files meaningfully,
generate diffs immediately WITHOUT asking questions first.**

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
@@ -1,6 +1,20 @@
 ## Elevator Pitch
+[Extracted elevator pitch from summary]

 ## Problem Statement
+[Extracted problem statement]

 ## Target Users
+[Extracted target users]

 ## Value Proposition
+[Extracted value proposition]

 ## Scope
+[Extracted scope - in and out]

 ## Constraints / Principles
+[Extracted constraints]
\`\`\`

\`\`\`diff
--- Roadmap.md
+++ Roadmap.md
@@ -1,1 +1,20 @@
 ## Milestones

+### M1 - [MVP Milestone Name]
+**Status:** active
+**Why it matters:** [Why this is the MVP]
+**Outcome:** [What users can do after this milestone]
+
+**Definition of Done**
+- [Observable criteria 1]
+- [Observable criteria 2]
+
+### M2 - [Next Milestone]
+**Status:** planned
+...
\`\`\`

\`\`\`diff
--- Tasks.md
+++ Tasks.md
@@ -1,1 +1,10 @@
 ## Current
+- [ ] [Task from summary]
+- [ ] [Task from summary]
+- [ ] [Task from summary]
\`\`\`

**CONTENT MAPPING RULES**

Overview.md:
- Elevator Pitch: 1-3 sentences capturing what + who + why
- Problem Statement: What's the pain, who experiences it
- Target Users: Primary users, their context
- Value Proposition: Main benefit, differentiator
- Scope: In-scope items, Out-of-scope items
- Constraints / Principles: Tech, time, budget, guiding principles

Roadmap.md:
- M1 is always MVP - the smallest version that proves this works
- Each milestone needs: status, why it matters, outcome, definition of done
- Milestones must be vertical (demo-able), not horizontal (layers/components)
- Set M1 Status to "active", other milestones to "planned"

Tasks.md:
${TASK_CREATION_GUIDANCE}
- Place tasks in the Current section
- Do NOT invent tasks - only extract from the provided summary

**RULES:**
- Generate all three diffs in a single response when possible
- If you must ask questions, ask them all at once
- After getting answers, generate diffs immediately

FILE CONTENTS (current state):
${workflowFileContents}
================================================================================
`
}
