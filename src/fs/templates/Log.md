---
schema_version: 2
doc_type: log
project:
  id: "<YYYYMMDD-shortslug>"
  name: "<Project Name>"

log:
  ordering: "append_or_freeform"  # not enforced
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
