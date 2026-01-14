# Lachesis

An Obsidian plugin for AI-powered project planning and management. Lachesis helps you define new projects through guided interviews and maintain existing ones with automated workflows.

## Features

- **AI-Powered Project Discovery**: Conversational interface to explore, define, and refine project ideas
- **Structured Project Scaffolding**: Generates organized markdown files with consistent structure
- **Multi-Provider Support**: Works with Anthropic (Claude) and OpenAI models
- **Automated Workflows**: Maintenance workflows for titling log entries, harvesting tasks, syncing git commits, and archiving completed work
- **AI-Guided Fill Sessions**: Iterative sessions to build out Overview, Roadmap, and Tasks documents
- **GitHub Integration**: Sync git commits to automatically mark tasks as complete
- **Persistent Chat History**: Chat logs saved per-project for continuity across sessions
- **Project Health Assessment**: Automatic detection of missing files, thin documents, and configuration issues
- **Diff Preview**: Review all AI-proposed changes before applying them

## Installation

### Manual Installation

1. Download the latest release (or build from source)
2. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/lachesis/` folder
3. Enable the plugin in Obsidian settings
4. Configure your API key in the plugin settings

### Building from Source

```bash
bun install
bun run build
```

## Usage

### New Project Interview

1. Click the brain-circuit icon in the ribbon (or use command palette: "Lachesis: Start new project interview")
2. Select your planning level (Light spark / Some notes / Well defined)
3. Answer questions about your project idea
4. Choose a project name from suggestions (or enter your own)
5. Project files are scaffolded in your configured projects folder

### Continue Existing Project

1. Click the brain-circuit icon in the ribbon (or use command palette: "Lachesis: Open project picker")
2. Select a project from the list
3. Chat with Lachesis about your project
4. Run workflows to organize and maintain your project files
5. Review proposed changes in the diff viewer before applying

## Configuration

Open Obsidian Settings > Lachesis to configure:

- **Provider**: Anthropic (Claude) or OpenAI
- **API Key**: Your provider's API key
- **Model**: Which model to use for conversations
- **Projects Folder**: Where to create new projects
- **GitHub Token**: Personal access token for private repos (optional, increases rate limits)

## Project Structure

When a project is scaffolded, these files are created:

```
ProjectName/
├── Overview.md      # Project north star (elevator pitch, problem, users, scope, constraints)
├── Roadmap.md       # Milestones, vertical slices, current focus
├── Tasks.md         # Now (single active task), Next, Later, with slice links
├── Log.md           # Progress notes, thinking, AI-extracted potential tasks
├── Ideas.md         # Scratch ideas and open questions
├── Archive.md       # Completed work organized by vertical slice
└── .ai/             # AI configuration and chat history
    ├── config.json  # Project settings (GitHub repo URL, etc.)
    └── logs/        # Persisted chat sessions as markdown files
```

## Workflows

Lachesis provides combined workflows for common project maintenance tasks:

| Workflow | Display Name | Description |
|----------|--------------|-------------|
| `log-refine` | Log: Refine | Title entries, extract potential tasks, review and move to Tasks.md |
| `tasks-harvest` | Tasks: Harvest | Find actionable items across all files (including Ideas.md) |
| `tasks-maintenance` | Tasks: Maintenance | Sync commits, archive completed tasks, promote next task |

AI-guided fill workflows for building documents from scratch:

| Workflow | Display Name | Description |
|----------|--------------|-------------|
| `fill-overview` | Overview: Fill | Interactive session to complete Overview.md section by section |
| `roadmap-fill` | Roadmap: Fill | Define milestones and vertical slices for your project |
| `tasks-fill` | Tasks: Fill | Extract tasks from Roadmap slices and set up initial work items |
| `init-from-summary` | Initialize from Summary | Batch-fill Overview, Roadmap, and Tasks from a design document |

### Workflow Details

**Log: Refine** combines three steps:
1. Add short titles (1-5 words) to log entries that lack them
2. Extract 0-3 potential tasks from each entry
3. Open groom modal to Keep, Reject, or Move tasks to Tasks.md

**Tasks: Harvest** scans all project files:
- Reads Overview, Roadmap, Tasks, Ideas, and Log
- Finds implicit TODOs, gaps, and actionable ideas
- De-duplicates against existing tasks
- Suggests destination (Now, Next, Later) and Roadmap slice links

**Tasks: Maintenance** handles the task lifecycle:
1. Sync git commits (if GitHub configured) to mark tasks complete
2. Archive completed tasks to Archive.md organized by vertical slice
3. If Now is empty, AI promotes the best task from Next/Later

## Development

```bash
# Install dependencies
bun install

# Development build (watch mode)
bun run dev

# Production build
bun run build

# Type check
bun run typecheck

# Build and deploy to Obsidian vault (requires OBSIDIAN_VAULT_PATH env var)
bun run build:deploy
```

### Testing in Obsidian

1. Run `bun run build`
2. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/lachesis/`
3. Reload Obsidian (Cmd+R / Ctrl+R)
4. Enable the plugin if not already enabled

## Architecture

### Provider Abstraction

Lachesis supports multiple AI providers through a common interface:

- **Anthropic**: Uses `@anthropic-ai/sdk` directly with streaming
- **OpenAI**: Uses Vercel AI SDK (`@ai-sdk/openai`, `ai`)

### Project Snapshots

Each session builds a `ProjectSnapshot` capturing:
- File existence, size, modification time
- Template fill status: `missing | template_only | thin | filled`
- Health issues: missing files, thin documents, configuration problems
- Workflow readiness gating

### Chat Persistence

Chat history is stored in `.ai/logs/` within each project:
- Files named by ISO timestamp: `2025-01-02T10-30-00.md`
- Markdown format with YAML frontmatter
- Full conversation history preserved for context

## License

MIT
