---
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
  slice_id: "VS1"
  intent: "What we are trying to accomplish right now in plain English."

ai:
  primary_job: "Keep a clean milestone sequence and maintain current focus + next actions."
  update_policy:
    allowed_to_change:
      - "reorder milestones based on value/constraints"
      - "clarify definitions of done"
      - "update current_focus"
      - "update Next 1–3 Actions"
    avoid:
      - "dumping granular chores here (belongs in Tasks.md)"
  extraction_rules: |
    Milestone work items -> Tasks.md vertical slice.
    Current focus should always point to a milestone + slice when possible.

tags: ["project/roadmap"]
---

# Roadmap — <Project Name>

## Current Focus
- **Milestone:** M1 — <Milestone title>
- **Vertical Slice:** VS1 — <Slice name>
- **Intent:** <One sentence. "We're trying to…">

## Next 1–3 Actions (execution ignition)
- [ ] <VS?-T?> <Small concrete step (~15–60 mins)>
- [ ] <VS?-T?> <Next step>
- [ ] <VS?-T?> <Next step>

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
- Tasks slice: [[Tasks#VS1 — <Vertical Slice Name>]]
- Key log entries: [[Log]]

---

### M2 — <Milestone Title>
**Status:** planned
**Why it matters:** <...>
**Outcome:** <...>

**Definition of Done (observable)**
- <...>

**Links**
- Tasks slice: [[Tasks#VS2 — <Vertical Slice Name>]]

---

## Cut / Deferred Milestones (kept intentionally small)
- <If this grows, move detail to Archive.md with rationale.>
