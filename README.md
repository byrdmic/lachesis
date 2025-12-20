# Lachesis

A Bun/Ink CLI that interviews users about project ideas, generates structured project documentation for Obsidian vaults, and scaffolds project folders with markdown templates.

## Features

- **AI-Powered Project Planning**: Conversational interface to explore and refine your project ideas
- **Structured Output**: Generates organized markdown files compatible with Obsidian
- **Session-Based Architecture**: CLI-first design enabling both interactive TUI and scriptable CLI usage
- **Multiple AI Providers**: Supports OpenAI and Anthropic (Claude) models

## Installation

```bash
bun install
```

## Quick Start

### Interactive TUI Mode

```bash
# Start the project launcher
bun run dev start

# Start a new project directly
bun run dev new
```

### CLI Session Mode

The session-based CLI allows programmatic control and testing:

```bash
# Start a new planning session
bun run dev session start --planning-level "Quick sketch"

# Send a message to the session
bun run dev session message <sessionId> --message "A CLI tool for managing tasks"

# Stream responses in real-time (NDJSON)
bun run dev session message <sessionId> --message "For developers" --stream

# Generate project name suggestions
bun run dev session names <sessionId>

# Finalize and scaffold the project
bun run dev session finalize <sessionId> --name "MyProject"
```

## Configuration

Configuration is stored at `~/.lachesis/config.json`:

```json
{
  "vaultPath": "~/Documents/Obsidian/Projects",
  "defaultProvider": "openai",
  "defaultModel": "gpt-4o",
  "apiKeyEnvVar": "OPENAI_API_KEY"
}
```

### Environment Variables

- `OPENAI_API_KEY` - Required for OpenAI provider
- `ANTHROPIC_API_KEY` - Required for Anthropic provider

## Project Structure

```
src/
├── ai/                    # AI provider integrations
│   ├── client.ts          # Main AI client interface
│   ├── prompts.ts         # System prompts
│   ├── anthropic-client.ts # Anthropic SDK integration
│   └── providers/         # Provider implementations
├── cli/                   # CLI entry and commands
│   ├── index.tsx          # Main entry point
│   └── commands/          # CLI command handlers
├── config/                # Configuration management
├── core/                  # Core business logic
│   ├── session/           # Session state machine
│   │   ├── types.ts       # Session types and interfaces
│   │   ├── session-store.ts    # State persistence
│   │   ├── session-operations.ts # Business logic
│   │   └── session-transitions.ts # State machine
│   ├── project/           # Project model and building
│   └── interview/         # Interview phases
├── fs/                    # File system operations
│   ├── scaffolder.ts      # Project scaffolding
│   └── templates/         # Markdown templates
├── ui/                    # Ink/React TUI components
│   ├── App.tsx            # Main app component
│   ├── NewProject/        # New project flow
│   ├── ExistingProject/   # Existing project flow
│   └── components/        # Shared UI components
└── debug/                 # Debug logging
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `start` | Launch the project picker/launcher |
| `new` | Start a new project interview directly |
| `session start` | Create a new planning session |
| `session list` | List all sessions |
| `session status <id>` | Get session status and messages |
| `session message <id>` | Send a message to session |
| `session names <id>` | Generate project name suggestions |
| `session finalize <id>` | Extract data and scaffold project |

## Session Steps

Sessions progress through these steps:

| Step | Description |
|------|-------------|
| `idle` | Session created but not started |
| `generating_question` | AI is generating the next question |
| `waiting_for_answer` | Waiting for user response |
| `generating_names` | AI is generating project name suggestions |
| `naming_project` | User is selecting a project name |
| `extracting_data` | AI is extracting structured project data |
| `ready_to_scaffold` | Ready to create project files |
| `scaffolding` | Creating project files |
| `complete` | Session finished successfully |
| `error` | An error occurred |

## Development

```bash
# Type check
bun run typecheck

# Run tests
bun test

# Run session tests only
bun test src/core/session/*.test.ts
```

### Manual Testing

Test the app end-to-end by running the CLI:

```bash
# Launch the TUI
bun run dev start

# Start a new project interview directly
bun run dev new

# Run with debug panel
bun run dev start --debug
```

When testing AI provider changes or streaming behavior, run the TUI and observe the conversation in real-time.

## Generated Project Structure

When a project is scaffolded, the following files are created:

```
ProjectName/
├── Overview.md      # Project vision, audience, problem statement
├── Roadmap.md       # Milestones and phases
├── Tasks.md         # Task tracking
├── Log.md           # Development log
├── Ideas.md         # Idea capture
└── Archive.md       # Completed/archived items
```

## Architecture

Lachesis uses a **session-based architecture** where the Ink TUI is a thin presentation layer over a CLI-drivable backend:

- **SessionManager**: Creates and manages planning sessions
- **SessionStore**: Persists session state (memory + disk)
- **SessionOperations**: Core business logic (AI calls, topic detection)
- **SessionTransitions**: State machine validation

This design enables:
- CLI testing without TUI interaction
- Scriptable automation
- Clear separation of UI and logic

## Documentation

- [CLI Testing Guide](docs/CLI-TESTING.md) - Detailed CLI command reference and test scenarios

## License

MIT
