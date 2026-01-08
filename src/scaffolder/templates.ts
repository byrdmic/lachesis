// Bundled markdown templates for project scaffolding

export type TemplateName = 'overview' | 'roadmap' | 'tasks' | 'log' | 'ideas' | 'archive'

export const TEMPLATES: Record<TemplateName, string> = {
  overview: `---
schema_version: 2
doc_type: overview
project:
  name: "<Project Name>"
  codename: "<Short Codename>"
  id: "<YYYYMMDD-shortslug>"
  status: active
  owner: "Mike"
  timezone: "America/New_York"

links:
  roadmap: "[[Roadmap]]"
  tasks: "[[Tasks]]"
  log: "[[Log]]"
  ideas: "[[Ideas]]"
  archive: "[[Archive]]"
  repo: "<url or obsidian link>"
  external_docs: []
  related_projects: []

source_of_truth:
  stable_intent: true
  scope_guardrails: true
  day_to_day_execution: false
  notes:
    - "This file is intentionally stable. If you're changing it weekly, you're probably logging or tasking the wrong thing."

ai:
  read_order: ["Overview.md", "Roadmap.md", "Tasks.md", "Log.md (recent first)", "Ideas.md", "Archive.md (only if needed)"]
  primary_job: "Preserve and clarify the project's north star so execution stays aligned."
  update_policy:
    allowed_to_change:
      - "clarify wording"
      - "add constraints discovered"
      - "refine success criteria"
      - "update links"
    avoid_churn:
      - "do not turn into a journal (use Log.md)"
      - "do not manage Next Actions here (use Roadmap/Tasks)"
  extraction_rules: |
    Actionable work -> Tasks.md
    Brainstorm / alternatives -> Ideas.md
    Superseded truth -> Archive.md
    Current focus + Next actions -> Roadmap.md

tags: ["project/overview"]
---

# Overview — <Project Name>

## Elevator Pitch (1–2 sentences)
<What are you building, for whom, and why does it matter?>

## Problem Statement
- **Current pain:** <What hurts today?>
- **Root cause (best guess):** <Why does it hurt?>
- **Consequence of doing nothing:** <What happens if you don't solve it?>

## Target Users & Use Context
- **Primary user(s):** <Who?>
- **User context:** <Where/when do they use it?>
- **Non-users / excluded users:** <Who is explicitly not the target?>

## Value Proposition
- **Primary benefit:** <What changes for the user?>
- **Differentiator:** <Why this vs alternatives?>

## Scope
### In-Scope
- <Bullets>

### Out-of-Scope (Anti-Goals)
- <Bullets>

## Success Criteria (Definition of "Done")
- **Minimum shippable success (MVP):**
  - <Observable/testable bullets>
- **Nice-to-have success:**
  - <Bullets>
- **Hard constraints that must remain true:**
  - <Bullets>

## Constraints
- **Time:** <deadlines, cadence>
- **Tech:** <stack constraints, hosting constraints>
- **Money:** <budget or "as close to $0 as possible">
- **Operational:** <privacy, local-first, offline, etc.>

## Reference Links
- Repo: <...>
- Docs: <...>
- Key decisions: (see [[Log]]; long-term outcomes in [[Archive]])
`,

  roadmap: `---
schema_version: 2
doc_type: roadmap
project:
  id: "<YYYYMMDD-shortslug>"
  name: "<Project Name>"
  status: active

roadmap:
  philosophy: "Milestones are vertical, demo-able, end-to-end outcomes. No chore lists here."
  milestone_granularity: "feature-complete points"
  ordering: "value-first, unblockers early"
  date_policy: "Dates optional; only use if you mean it."

current_focus:
  milestone_id: "M1"
  intent: "What we are trying to accomplish right now in plain English."

ai:
  primary_job: "Keep a clean milestone sequence and maintain current focus."
  update_policy:
    allowed_to_change:
      - "reorder milestones based on value/constraints"
      - "clarify definitions of done"
      - "update current_focus"
    avoid:
      - "dumping granular chores here (belongs in Tasks.md)"
      - "putting Next 1-3 Actions here (belongs in Tasks.md)"
  extraction_rules: |
    Milestone work items -> Tasks.md.
    Next actions -> Tasks.md.
    Current focus should always point to the active milestone.

tags: ["project/roadmap"]
---

# Roadmap — <Project Name>

## Current Focus
- **Milestone:** M1 — <Milestone title>
- **Intent:** <One sentence. "We're trying to…">

---

## Milestone Index (fast scan)
- M1 — <Milestone title> (Status: planned)
- M2 — <Milestone title> (Status: planned)

---

## Milestones

### M1 — <Milestone Title>
**Status:** planned  <!-- planned | active | done | blocked | cut -->
**Why it matters:** <One sentence value>
**Outcome:** <What exists when done?>

**Definition of Done (observable)**
- <Demo-able bullet>
- <Testable bullet>
- <User can… bullet>

**Dependencies**
- <External constraint / other milestone>

**Links**
- Tasks: [[Tasks]]
- Key log entries: [[Log]]

---

### M2 — <Milestone Title>
**Status:** planned
**Why it matters:** <...>
**Outcome:** <...>

**Definition of Done (observable)**
- <...>

**Links**
- Tasks: [[Tasks]]

---

## Cut / Deferred Milestones (kept intentionally small)
- <If this grows, move detail to Archive.md with rationale.>
`,

  tasks: `---
schema_version: 2
doc_type: tasks
project:
  id: "<YYYYMMDD-shortslug>"
  name: "<Project Name>"
  status: active

tasks:
  philosophy: "Vertical slices, smallest end-to-end shippable increments."
  rule_of_three: "Always maintain Next 1–3 Actions at the top."
  grooming_policy: "Speculative -> Ideas.md. Done/superseded -> Archive.md."
  id_format: "VS#-T#"

ai:
  primary_job: "Keep actionable work organized and ensure momentum."
  update_policy:
    allowed_to_change:
      - "split tasks into smaller steps"
      - "promote items into Next Actions"
      - "add acceptance checks"
      - "clarify verbs and outcomes"
    avoid:
      - "rewriting milestone outcomes here"
  extraction_rules: |
    If Log.md contains "need to / should / todo / don't forget", create a task here.
    If an item is not actionable, move it to Ideas.md.
    If finished/superseded, move it to Archive.md and leave a pointer.

tags: ["project/tasks"]
---

# Tasks — <Project Name>

## Next 1–3 Actions (always kept fresh)
- [[#^VS1-T1|VS1-T1]] <Smallest concrete step (~15–60 minutes)>
- [[#^VS1-T2|VS1-T2]] <Next step>
- [[#^VS1-T3|VS1-T3]] <Next step>

## Active Vertical Slices

### VS1 — <Slice Name>
**Goal:** <End-to-end capability you can demo>
**Why:** <Value / milestone alignment>
**Milestone link:** [[Roadmap#M1 — <Milestone Title>]]

**Definition of Done**
- <User can…>
- <System does…>

**Tasks**
- [ ] VS1-T1 <Verb + object> ^VS1-T1
  - Acceptance: <How you'll know it's done>
- [ ] VS1-T2 <...> ^VS1-T2
- [ ] VS1-T3 <...> ^VS1-T3

---

## Blocked / Waiting
- [ ] <Thing blocked> — blocked by <dependency> — unblock plan: <...>

## Future Tasks (actionable, but not now)
- [ ] <Task>
- [ ] <Task>

## Recently Completed (keep short; archive the rest)
- [x] <Item> (details in [[Archive]])
`,

  log: `---
schema_version: 2
doc_type: log
project:
  id: "<YYYYMMDD-shortslug>"
  name: "<Project Name>"

log:
  ordering: "append_or_freeform"
  purpose:
    - "Freeform progress notes and thinking."
    - "Capture decisions, discoveries, and context while working."
    - "Allow task extraction without forcing structure."
  task_capture_keywords: ["todo", "TODO", "don't forget", "need to", "we should", "fix", "add", "remove", "refactor", "later"]

ai:
  primary_job: "Extract tasks/decisions/updates from messy real-time notes without rewriting the user's voice."
  update_policy:
    allowed_to_change:
      - "light formatting only when it improves readability"
      - "extract actionable items into Tasks.md"
      - "extract brainstorms into Ideas.md"
    avoid:
      - "rewriting entries into a template"
      - "changing the meaning or tone"
  extraction_rules: |
    "Need to / should / TODO / don't forget" => Tasks.md
    Speculative alternatives => Ideas.md
    Superseded truth => Archive.md
    Stable intent changes => Overview.md (rare)

tags: ["project/log"]
---

# Log — <Project Name>

<Write whatever you want here. No structure required.>
`,

  ideas: `---
schema_version: 2
doc_type: ideas
project:
  id: "<YYYYMMDD-shortslug>"
  name: "<Project Name>"

ideas:
  purpose:
    - "Loose scratchpad for raw ideas."
    - "Prevent clutter in Tasks/Roadmap."
  promotion_rule: "If it becomes actionable, move to Tasks.md and link back (optional)."
  demotion_rule: "If it's dead or replaced, move to Archive.md."

ai:
  primary_job: "Keep this lightweight; only extract/promote when something becomes real work."
  update_policy:
    allowed_to_change:
      - "light organization (group related ideas)"
      - "add links when promoted"
    avoid:
      - "forcing structure"
      - "turning ideas into tasks inside this file"

tags: ["project/ideas"]
---

# Ideas — <Project Name>

Random scratch ideas live here. Messy is fine.

## Scratch Ideas
- <Idea>
- <Idea>
- <Idea>

## Open Questions
- Q: <Question>
  - Options: <A / B / C>
  - What would decide it: <...>
`,

  archive: `---
schema_version: 2
doc_type: archive
project:
  id: "<YYYYMMDD-shortslug>"
  name: "<Project Name>"

archive:
  purpose:
    - "Keep active docs clean without losing history."
    - "Store completed slices, superseded plans, rejected ideas, and deep decision rationale."
  rule: "Move, don't duplicate. Leave a short pointer in the original file when needed."

ai:
  primary_job: "Preserve history while keeping active artifacts lean."
  update_policy:
    allowed_to_change:
      - "organize for retrieval"
      - "add short summaries for context"
    avoid:
      - "reviving archived work unless explicitly requested"
  extraction_rules: |
    If it is no longer active truth, archive it with:
    (1) what it was, (2) why it changed, (3) what replaced it, (4) date.

tags: ["project/archive"]
---

# Archive — <Project Name>

## Archive Index
- Completed vertical slices
- Superseded plans
- Rejected ideas
- Deep decision history

## Completed Vertical Slices
### <YYYY-MM-DD> — VS1 — <Slice Name>
**Moved from:** [[Tasks#VS1 — <Slice Name>]]
**Outcome delivered:** <what shipped>
**Key links:** <repo/commit/PR/notes>
**Notes:** <what you learned / what changed>

## Superseded / Retired Plans
### <YYYY-MM-DD> — <Old Plan Title>
**Replaced by:** <link to new plan>
**Why it changed:** <rationale>
**What stayed true:** <...>
**What became false:** <...>

## Rejected Ideas
### <YYYY-MM-DD> — <Idea Title>
**Origin:** [[Ideas]]
**Why rejected:** <...>
**If revisited, what would need to be true:** <...>

## Deep Decision History
- <Long-form rationale that doesn't belong in Overview/Log>
`,
}
