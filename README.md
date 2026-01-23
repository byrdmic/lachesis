# Lachesis

An Obsidian plugin for AI-powered project planning and management. Lachesis helps you define new projects through guided interviews and maintain existing ones with automated workflows.

## Features

- **AI-Powered Project Discovery**: Conversational interface to explore, define, and refine project ideas
- **Structured Project Scaffolding**: Generates organized markdown files with consistent structure
- **Multi-Provider Support**: Works with Anthropic (Claude) and OpenAI models
- **Plan Work Workflow**: Generate enriched, AI-ready tasks from work descriptions with full context
- **Task Enrichment**: Add rich context (why, considerations, acceptance criteria) to tasks for Claude Code handoff
- **Persistent Chat History**: Chat logs saved per-project for continuity across sessions
- **Project Health Assessment**: Automatic detection of missing files, thin documents, and configuration issues
- **Diff Preview**: Review all AI-proposed changes before applying them
- **Auto-Apply**: Optional auto-apply for low-risk workflows (configurable per workflow)

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
- **API Key**: API key for each provider (Anthropic and/or OpenAI)
- **Model**: Model selection per provider (e.g., claude-sonnet-4-5 for Anthropic, gpt-5.2 for OpenAI)
- **Projects Folder**: Where to create new projects
- **GitHub Token**: Personal access token for private repos (optional, increases rate limits)
- **Workflow Auto-Apply**: Enable auto-apply for specific low-risk workflows

## Project Structure

When a project is scaffolded, these files are created:

```
ProjectName/
├── Overview.md      # Project north star (elevator pitch, problem, users, scope, constraints)
├── Roadmap.md       # Milestones with vertical slices (demo-able features)
├── Tasks.md         # Current, Blocked, Later, Done - with optional slice links
├── Log.md           # Freeform progress notes and thinking
├── Ideas.md         # Scratch ideas and open questions
├── Archive.md       # Completed work, superseded plans, rejected ideas
└── .ai/             # AI configuration and chat history
    ├── config.json  # Project settings (GitHub repo URL, etc.)
    └── logs/        # Persisted chat sessions as markdown files
```

## Workflows

Lachesis provides automated workflows for common project maintenance tasks. Workflows are accessible via buttons in the project UI or by requesting them in chat.

### Available Workflows

| Workflow | Display Name | Description |
|----------|--------------|-------------|
| `plan-work` | Plan Work | Generate enriched tasks from a work description |
| `enrich-tasks` | Tasks: Enrich | Add rich context to tasks for Claude Code handoff |
| `init-from-summary` | Initialize from Summary | Batch-fill Overview, Roadmap, and Tasks from a design document (hidden, available via chat) |

### Workflow Details

**Plan Work** generates tasks from a description of work you want to do:
- Reads all project files to understand context
- Generates 1-5 tasks with full enrichment inline (why, considerations, acceptance criteria)
- Links tasks to existing Roadmap slices or suggests creating new ones
- Tasks are ready for immediate AI handoff (Claude Code, etc.)

**Tasks: Enrich** adds context to existing tasks for handoff:
- Gathers context from Overview constraints, Roadmap slices, Log entries, and Ideas
- Adds why the task exists, key considerations, and acceptance criteria
- Prioritizes tasks in the Current section
- Skips tasks that already have enrichment blocks

**Initialize from Summary** batch-fills project files:
- Parses a design summary (from an external AI conversation or planning document)
- Generates unified diffs for Overview.md, Roadmap.md, and Tasks.md
- Presents changes in a batch diff viewer for review

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
