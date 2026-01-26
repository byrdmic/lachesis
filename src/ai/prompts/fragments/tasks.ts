// Shared task prompt fragments for reuse across workflows

export const TASK_CREATION_GUIDANCE = `
## Task Creation

### Task Format
- Simple checkbox: \`- [ ] Task description\`
- Concrete verb + object: "Create modal component" not "Work on UI"

### Task Sizing
- Atomic: 15-60 minutes of work
- If larger, break into subtasks
- Clear acceptance: How do you know it's done?

### What Makes a Good Task
- Extracted, not invented: Pull from project content, don't make up work
- Actionable: Can start working immediately
- Observable completion: You can tell when it's done
`

export const TASK_ENRICHMENT_STRUCTURE = `
## Task Enrichment

For tasks that need context for handoff (to Claude Code, another developer, etc.),
add an enrichment block with these fields:

- **Why:** 1-2 sentences on motivation/value (from Roadmap slice, Log context, or project goals)
- **Considerations:** 2-5 bullet points of technical or design considerations
- **Acceptance:** Observable/testable criteria for "done"
- **Constraints:** Relevant constraints from Overview.md (optional - only if applicable)

### Guidelines Per Field

**Why (Required)**
- Connect to project goals or user value
- Reference Roadmap slice if task has [[Roadmap#...]] link
- Pull from Log.md source if task has <!-- from Log.md --> comment

**Considerations (Required, 2-5 bullets)**
- Technical decisions to make
- Design considerations
- Edge cases to handle
- Dependencies or prerequisites

**Acceptance (Required)**
- Observable outcomes (user can X, system shows Y)
- Testable criteria
- Be specific, not vague ("works correctly")

**Constraints (Optional)**
- Only include if Overview.md has relevant constraints
- Don't pad with generic constraints
- Omit entirely if no constraints apply
`

export const TASK_ENRICHMENT_EXAMPLE = `
### Enrichment Example

Task: \`- [ ] Implement user authentication [[Roadmap#VS2 - Auth System]]\`

Enrichment:
\`\`\`
why: "Users need secure access to their data; prerequisite for all personalized features"
considerations:
  - OAuth vs email/password approach
  - Session management and token refresh
  - Rate limiting for security
acceptance:
  - User can sign up with email/password
  - User can log in and log out
  - Sessions persist across browser refresh
constraints:
  - Must support offline-first per Overview.md
\`\`\`
`

export const TASK_CONTEXT_SOURCES = `
### Context Sources

When enriching tasks, check these sources:

1. **Roadmap.md Slices** - For tasks with [[Roadmap#VS...]] links:
   - Pull Purpose, Delivers, Solves fields from linked slice
   - These become the "Why" and "Acceptance" parts

2. **Log.md Source Entries** - For tasks with <!-- from Log.md YYYY-MM-DD --> comments:
   - Find the original log entry for additional context
   - What was the user thinking when they noted this?

3. **Ideas.md** - Related ideas:
   - Did this task spawn from an idea?
   - Are there considerations or alternatives discussed there?

4. **Overview.md Constraints**:
   - Tech constraints (stack, hosting)
   - Operational constraints (offline-first, privacy)
   - Scope boundaries (what's in/out)

5. **Archive.md** - Related completed work:
   - Prior attempts or related tasks?
   - Lessons learned?
`

export const PROMPT_GENERATION_GUIDANCE = `
## Execution Prompt Generation

Generate a ready-to-use prompt for each task that another AI (like Claude Code) can execute autonomously.

### Prompt Structure

The prompt MUST follow this exact format:

\`\`\`
## Task: [Concrete action - verb + object]

### Context
[1-2 sentences: Why this matters, derived from enrichment.why]
[Reference to project goals or user value]

### Requirements
[Explicit, specific instructions derived from task description]
[Include relevant technical details from enrichment.considerations]

### Acceptance Criteria
[Observable outcomes from enrichment.acceptance]
[Each criterion should be verifiable]

### Constraints & Edge Cases
[From enrichment.constraints if any]
[Key edge cases from enrichment.considerations]
\`\`\`

### Best Practices for Prompt Generation

**Be Explicit**
- Use concrete verbs: "Create", "Add", "Modify", "Remove"
- Specify exact outcomes: "User sees error message" not "handle errors"
- Include file paths when known from project context

**Provide Context**
- Explain motivation (the "why") so the AI can make good judgment calls
- Reference project constraints that affect implementation
- Ground instructions in actual project patterns

**Define Observable Success**
- Every acceptance criterion should be testable
- Prefer "User can X" or "System shows Y" over "works correctly"
- Include edge cases worth handling

**Stay Focused**
- One clear objective per prompt
- Don't bundle unrelated work
- If complex, note dependencies explicitly
`
