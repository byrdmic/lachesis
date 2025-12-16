---
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
