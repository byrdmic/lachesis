---
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
  id_format: "VS#-T#"  # example: VS1-T3

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
- [ ] <VS?-T?> <Smallest concrete step (~15–60 minutes)>
- [ ] <VS?-T?> <Next step>
- [ ] <VS?-T?> <Next step>

## Active Vertical Slices

### VS1 — <Slice Name>
**Goal:** <End-to-end capability you can demo>
**Why:** <Value / milestone alignment>
**Milestone link:** [[Roadmap#M1 — <Milestone Title>]]

**Definition of Done**
- <User can…>
- <System does…>

**Tasks**
- [ ] VS1-T1 <Verb + object>
  - Acceptance: <How you'll know it's done>
- [ ] VS1-T2 <...>
- [ ] VS1-T3 <...>

---

## Blocked / Waiting
- [ ] <Thing blocked> — blocked by <dependency> — unblock plan: <...>

## Future Tasks (actionable, but not now)
- [ ] <Task>
- [ ] <Task>

## Recently Completed (keep short; archive the rest)
- [x] <Item> (details in [[Archive]])
