# CLI Session Testing Guide

This document describes how to test the Lachesis session-based CLI commands.

## Prerequisites

- Bun installed
- Dependencies installed: `bun install`
- Environment variable set: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`

## Command Reference

### Session Management

#### Start a new session

```bash
# Basic start
bun run dev session start

# With planning level
bun run dev session start --planning-level "Quick sketch"
bun run dev session start --planning-level "Full blueprint"

# With initial project context
bun run dev session start --planning-level "Quick sketch" --project-name "My App" --one-liner "A task manager"
```

**Expected Output:**
```json
{
  "sessionId": "sess_abc123_xyz789",
  "type": "new_project",
  "step": "waiting_for_answer",
  "planningLevel": "Quick sketch",
  "createdAt": "2025-12-19T22:42:31.340Z"
}
```

#### List all sessions

```bash
bun run dev session list
```

**Expected Output:**
```json
{
  "sessions": [
    {
      "id": "sess_abc123_xyz789",
      "type": "new_project",
      "step": "waiting_for_answer",
      "createdAt": "2025-12-19T22:42:31.340Z",
      "updatedAt": "2025-12-19T22:42:33.515Z"
    }
  ]
}
```

#### Get session status

```bash
bun run dev session status <sessionId>
```

**Expected Output:**
```json
{
  "id": "sess_abc123_xyz789",
  "type": "new_project",
  "step": "waiting_for_answer",
  "createdAt": "2025-12-19T22:42:31.340Z",
  "updatedAt": "2025-12-19T22:42:33.515Z",
  "planningLevel": "Quick sketch",
  "projectName": "",
  "oneLiner": "",
  "messages": [
    {
      "role": "assistant",
      "content": "Good evening, sir. What are we building today?",
      "timestamp": "2025-12-19T22:42:31.340Z-z7pd9y"
    }
  ],
  "coveredTopics": []
}
```

### Conversation

#### Send a message

```bash
# Standard response
bun run dev session message <sessionId> --message "A CLI tool for managing todo lists"

# With streaming (NDJSON output)
bun run dev session message <sessionId> --message "A CLI tool for managing todo lists" --stream
```

**Expected Output (standard):**
```json
{
  "sessionId": "sess_abc123_xyz789",
  "step": "waiting_for_answer",
  "response": "Who will be using this tool?",
  "messages": [...],
  "coveredTopics": ["elevator_pitch"]
}
```

**Expected Output (streaming NDJSON):**
```
{"type":"message_added","message":{"role":"user","content":"A CLI tool..."}}
{"type":"step_changed","step":"generating_question","previousStep":"waiting_for_answer"}
{"type":"ai_streaming","partial":"Who"}
{"type":"ai_streaming","partial":"Who will"}
...
{"type":"ai_complete","content":"Who will be using this tool?"}
{"type":"step_changed","step":"waiting_for_answer","previousStep":"generating_question"}
```

### Project Naming

#### Generate name suggestions

```bash
bun run dev session names <sessionId>
```

**Expected Output:**
```json
{
  "sessionId": "sess_abc123_xyz789",
  "suggestions": [
    {
      "name": "TermiTask",
      "reasoning": "Combines 'terminal' and 'task'..."
    },
    {
      "name": "TodoForge",
      "reasoning": "Suggests crafting and organizing tasks..."
    }
  ]
}
```

### Finalization

#### Finalize and scaffold project

```bash
# With explicit name
bun run dev session finalize <sessionId> --name "TermiTask"

# With custom vault path
bun run dev session finalize <sessionId> --name "TermiTask" --vault-path "/tmp/test-vault"

# Auto-generate name (uses first AI suggestion)
bun run dev session finalize <sessionId>
```

**Expected Output:**
```json
{
  "sessionId": "sess_abc123_xyz789",
  "step": "complete",
  "projectPath": "/path/to/vault/TermiTask",
  "extractedData": {
    "vision": {
      "oneLinePitch": "A CLI tool for managing todo lists...",
      "description": "...",
      "primaryAudience": "...",
      "problemSolved": "...",
      "successCriteria": "..."
    },
    "constraints": {
      "known": [],
      "assumptions": [],
      "risks": [],
      "antiGoals": []
    },
    "execution": {
      "suggestedFirstMove": "...",
      "techStack": "..."
    }
  }
}
```

## Session Steps

Sessions progress through these steps:

| Step | Description |
|------|-------------|
| `idle` | Session created but not yet started |
| `generating_question` | AI is generating the next question |
| `waiting_for_answer` | Waiting for user response |
| `generating_names` | AI is generating project name suggestions |
| `naming_project` | User is selecting a project name |
| `extracting_data` | AI is extracting structured project data |
| `ready_to_scaffold` | Ready to create project files |
| `scaffolding` | Creating project files |
| `complete` | Session finished successfully |
| `error` | An error occurred |

## Test Scenarios

### Scenario 1: Full Flow

```bash
# 1. Start session
SESSION_ID=$(bun run dev session start --planning-level "Quick sketch" 2>&1 | jq -r .sessionId)
echo "Session: $SESSION_ID"

# 2. Send messages
bun run dev session message "$SESSION_ID" --message "A CLI todo list manager"
bun run dev session message "$SESSION_ID" --message "For developers who work in the terminal"
bun run dev session message "$SESSION_ID" --message "They want to track tasks without leaving their workflow"

# 3. Generate names
bun run dev session names "$SESSION_ID"

# 4. Finalize
bun run dev session finalize "$SESSION_ID" --name "TermiTask" --vault-path "/tmp/test"

# 5. Verify
ls -la /tmp/test/TermiTask
```

### Scenario 2: Streaming Test

```bash
# Watch streaming events in real-time
bun run dev session message "$SESSION_ID" --message "Test message" --stream | while read -r line; do
  echo "Event: $line"
done
```

### Scenario 3: Error Handling

```bash
# Invalid session ID
bun run dev session status nonexistent_session
# Expected: Error: Session not found

# Missing message
bun run dev session message "$SESSION_ID"
# Expected: Error: Message is required
```

## Common Issues

### "messages must not be empty"
This error occurred with the first AI message. Fixed in OpenAI and Anthropic providers by providing a default prompt when messages array is empty.

### Vault path not respected
The `--vault-path` flag was added to `session finalize` to override the default vault path from config.

## Files Modified for Testing

- `src/ai/providers/openai/index.ts` - Empty messages handling
- `src/ai/anthropic-client.ts` - Empty messages handling
- `src/cli/commands/session.ts` - Added `--vault-path` flag
