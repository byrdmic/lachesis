# Test Plan: Template Improvements & Load Project Enhancements

## Summary of Changes

### Part A: Template Changes

1. **A1: Overview.md** - Removed corporate sections:
   - `## Assumptions & Validation Plan` (table)
   - `## Risks (and Mitigations)` (table)

2. **A2: Roadmap.md** - Removed "Next 1-3 Actions" section:
   - Section `## Next 1–3 Actions (execution ignition)` removed from body
   - Frontmatter `ai.update_policy.allowed_to_change` no longer includes "update Next 1–3 Actions"
   - Added "putting Next 1-3 Actions here (belongs in Tasks.md)" to `avoid` list

3. **A3: Tasks.md** - Already contains "Next 1-3 Actions" section (verified, no change needed)

### Part B: Empty Scaffold Behavior

- New function `hasMinimalExtractedData()` in `scaffolder.ts` detects sparse project definitions
- Minimal scaffolds now include:
  - **M1 — Define the Project** milestone in Roadmap.md with clear DoD
  - **VS1 — Project Definition** slice in Tasks.md with 5 specific tasks
  - Project definition tasks linked to Overview.md, Roadmap.md, and Tasks.md sections

### Part C: Load Project Improvements

1. **C1: File Priority Ranking** - New `CORE_FILE_PRIORITY` constant:
   - Overview.md → Ideas.md → Tasks.md → Roadmap.md → Log.md → Archive.md
   - Readiness assessment uses this order for prioritized file list

2. **C2: Format Detection** - New validation module (`src/core/project/validation.ts`):
   - `EXPECTED_SECTIONS` per file
   - `MISPLACED_SECTIONS` detection
   - `validateFileFormat()` function
   - Format mismatch explanations

3. **C3: Workflow Gating** - Readiness assessment in snapshot:
   - `ProjectReadinessAssessment` type added to snapshot
   - Gating conditions based on Overview, Tasks, Roadmap status
   - System prompt updated with workflow gating instructions

---

## Manual Test Steps

### Test 1: New Project - Minimal Input → "Define the Project" Milestone

**Steps:**
1. Run `bun run src/cli/index.tsx`
2. Select "New Project"
3. When asked for project details, provide minimal info:
   - Name: "TestMinimal"
   - One-liner: "A test" (short)
   - Skip or give very brief answers to discovery questions
   - Say "skip questions" or "just scaffold it" early
4. Let scaffolding complete

**Expected Results:**
- Roadmap.md contains:
  - `M1 — Define the Project` as first milestone with status `active`
  - Definition of Done listing Overview, Roadmap, Tasks requirements
- Tasks.md contains:
  - `VS1 — Project Definition` slice
  - 5 tasks: Write elevator pitch, Define problem, Identify users, Add milestone, Update actions
  - Each task has acceptance criteria

**Verification:**
```bash
# After scaffold completes, check the generated files:
grep -A 20 "M1 — Define the Project" ~/path/to/vault/TestMinimal/Roadmap.md
grep -A 25 "VS1 — Project Definition" ~/path/to/vault/TestMinimal/Tasks.md
```

---

### Test 2: New Project - Normal Input → Templates Correct

**Steps:**
1. Run `bun run src/cli/index.tsx`
2. Select "New Project"
3. Provide full answers:
   - Name: "TestFull"
   - Detailed one-liner
   - Answer all discovery questions thoroughly
4. Let scaffolding complete

**Expected Results:**
- Overview.md does NOT contain:
  - `## Assumptions & Validation Plan`
  - `## Risks (and Mitigations)`
- Roadmap.md does NOT contain:
  - `## Next 1–3 Actions`
- Tasks.md DOES contain:
  - `## Next 1–3 Actions`

**Verification:**
```bash
# Check Overview.md has no corporate sections:
grep "Assumptions" ~/path/to/vault/TestFull/Overview.md  # Should find nothing
grep "Risks" ~/path/to/vault/TestFull/Overview.md       # Should find nothing

# Check Roadmap.md has no Next Actions:
grep "Next 1" ~/path/to/vault/TestFull/Roadmap.md       # Should find nothing

# Check Tasks.md has Next Actions:
grep "Next 1–3 Actions" ~/path/to/vault/TestFull/Tasks.md  # Should find it
```

---

### Test 3: Load Project - Non-Standard Files Detection

**Setup:** Create a test project folder manually with non-standard Overview.md:
```bash
mkdir -p ~/path/to/vault/TestNonStandard
cat > ~/path/to/vault/TestNonStandard/Overview.md << 'EOF'
---
schema_version: 2
---
# My Custom Overview

## Next 1-3 Actions
- Do something
- Do something else

## Random Section
Some content here
EOF
```

**Steps:**
1. Run `bun run src/cli/index.tsx`
2. Select "Load Existing Project"
3. Select "TestNonStandard"

**Expected Results:**
- AI notices:
  - Overview.md has "Next 1-3 Actions" which belongs in Tasks.md
  - Missing expected sections (Elevator Pitch, Problem Statement, etc.)
- AI offers to help migrate content or fill in missing sections
- Readiness shows "NOT READY" with prioritized issues

**Verification:**
- Check debug output shows `READINESS: NOT READY`
- Check AI mentions format issues in opening message
- Check AI suggests filling basics before offering workflows

---

### Test 4: Load Project - Prioritized Basics Before Workflows

**Setup:** Create a minimal project with template-only files:
```bash
mkdir -p ~/path/to/vault/TestTemplateOnly
# Copy the raw templates without filling in
cp src/fs/templates/Overview.md ~/path/to/vault/TestTemplateOnly/
cp src/fs/templates/Roadmap.md ~/path/to/vault/TestTemplateOnly/
cp src/fs/templates/Tasks.md ~/path/to/vault/TestTemplateOnly/
```

**Steps:**
1. Run `bun run src/cli/index.tsx`
2. Select "Load Existing Project"
3. Select "TestTemplateOnly"

**Expected Results:**
- AI greeting includes readiness assessment
- AI does NOT offer named workflows (Synthesize, Log Digest, etc.)
- AI focuses on filling in basics first:
  - "Overview.md has not been filled in"
  - "Tasks.md has no actionable items"
  - "Roadmap.md has no milestones defined"
- AI suggests starting with Overview.md (highest priority)

**Verification:**
- AI opening message mentions "basics needed" or similar
- AI suggests filling Overview.md first
- AI does NOT suggest running named workflows

---

## Files Changed

| File | Change |
|------|--------|
| `src/fs/templates/Overview.md` | Removed Assumptions & Risks sections |
| `src/fs/templates/Roadmap.md` | Removed Next 1-3 Actions section |
| `src/fs/scaffolder.ts` | Added `hasMinimalExtractedData()`, updated template processing |
| `src/core/project/validation.ts` | NEW: File validation utilities |
| `src/core/project/snapshot.ts` | Added `ProjectReadinessAssessment` type |
| `src/core/project/snapshot-builder.ts` | Added `assessReadiness()` function |
| `src/ai/prompts.ts` | Updated snapshot format and added workflow gating |
| `src/ai/prompts.test.ts` | Updated mock snapshot with readiness field |

---

## Automated Tests

Run the existing test suite to ensure nothing is broken:
```bash
bun run typecheck  # Verifies type correctness
bun test           # Runs all tests
```

---

## Notes

- The validation module (`src/core/project/validation.ts`) is created but not fully integrated into the UI for migration prompts. The AI handles this via the updated system prompt.
- Format detection is done via the `templateStatus` field which already exists in the snapshot.
- The AI is instructed to detect misplaced sections and offer to migrate them.
