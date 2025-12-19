---
schema_version: 2
doc_type: overview
project:
  name: "<Project Name>"
  codename: "<Short Codename>"
  id: "<YYYYMMDD-shortslug>"  # ex: 20251216-lachesis
  status: active  # active | paused | archived
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
