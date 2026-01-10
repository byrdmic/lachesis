# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

An Obsidian plugin that helps users plan projects through AI-powered interviews, generating structured project documentation within their Obsidian vault. It provides:

- **New project interviews**: AI-guided discovery sessions to define projects
- **Existing project workflows**: Automated document maintenance (titling log entries, harvesting tasks, syncing commits, archiving completed work)
- **Chat-based project management**: Persistent AI conversations with access to project context
- **GitHub integration**: Fetch commit history to sync task completion

## Project Structure

```
lachesis/
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── settings.ts          # Settings types and UI
│   ├── ai/                  # AI providers and client
│   │   ├── client.ts        # High-level AI operations
│   │   ├── prompts.ts       # System prompt builder
│   │   └── providers/       # Provider abstraction
│   │       ├── types.ts     # Common interface
│   │       ├── factory.ts   # Provider factory
│   │       ├── anthropic/   # Anthropic SDK provider
│   │       └── openai/      # OpenAI (Vercel AI SDK) provider
│   ├── core/
│   │   ├── chat/            # Chat persistence system
│   │   │   ├── types.ts     # ChatLog, ChatLogMetadata
│   │   │   ├── chat-store.ts # File-based chat storage
│   │   │   └── index.ts
│   │   ├── interview/       # Interview phases and types
│   │   ├── project/         # Project types and snapshot
│   │   │   ├── types.ts     # Project type definitions
│   │   │   ├── snapshot.ts  # ProjectSnapshot type
│   │   │   ├── snapshot-builder.ts # Build snapshots from files
│   │   │   └── template-evaluator.ts # Check template fill status
│   │   ├── session/         # Session state machine
│   │   └── workflows/       # Workflow definitions
│   │       ├── types.ts     # WorkflowDefinition type
│   │       └── definitions.ts # All workflow configs
│   ├── github/              # GitHub API integration
│   │   ├── types.ts         # GitHub API types
│   │   ├── client.ts        # REST API client
│   │   └── index.ts
│   ├── scaffolder/          # File scaffolding
│   │   ├── scaffolder.ts    # Creates project files
│   │   └── templates.ts     # Markdown templates
│   ├── ui/                  # Obsidian modals
│   │   ├── interview-modal.ts        # New project interview
│   │   ├── existing-project-modal.ts # Main project UI
│   │   ├── project-picker-modal.ts   # Project selection
│   │   ├── diff-viewer-modal.ts      # Preview changes
│   │   ├── harvest-tasks-modal.ts    # Task harvesting review
│   │   ├── potential-tasks-modal.ts  # Log task grooming
│   │   ├── ideas-groom-modal.ts      # Ideas task extraction
│   │   ├── sync-commits-modal.ts     # Git commit sync review
│   │   ├── archive-completed-modal.ts # Archive task review
│   │   ├── git-log-modal.ts          # Git history viewer
│   │   └── components/               # Reusable UI components
│   │       ├── chat-interface.ts     # Main chat UI
│   │       ├── chat-sidebar.ts       # Chat history sidebar
│   │       ├── workflow-executor.ts  # Workflow execution UI
│   │       └── issues-panel.ts       # Project issues display
│   └── utils/               # Utility functions
│       ├── diff.ts                   # Diff generation
│       ├── log-parser.ts             # Log entry parsing
│       ├── harvest-tasks-parser.ts   # Harvest tasks JSON parser
│       ├── ideas-groom-parser.ts     # Ideas groom JSON parser
│       ├── potential-tasks-parser.ts # Potential tasks parser
│       ├── sync-commits-parser.ts    # Commit sync JSON parser
│       └── archive-completed-parser.ts # Archive JSON parser
├── dist/                    # Build output (gitignored)
├── manifest.json            # Plugin manifest
├── styles.css               # Plugin styles
└── package.json             # Dependencies
```

## Commands

```bash
bun install              # Install dependencies
bun run dev              # Build in watch mode
bun run build            # Production build
bun run build:deploy     # Build and copy to Obsidian vault
bun run typecheck        # Type check
```

## Architecture

### Plugin Entry

- **Entry point**: `src/main.ts`
  - Registers ribbon icon (brain-circuit)
  - Commands: `open-project-picker`, `new-project-interview`
  - Settings tab registration
  - Smart opener: detects if active file is in a project folder

- **Settings**: `src/settings.ts`
  - Provider selection (Anthropic/OpenAI)
  - API keys for each provider
  - GitHub token for commit syncing
  - Projects folder path

### AI System

**Provider abstraction** (`src/ai/providers/types.ts`):
```typescript
interface AIProvider {
  type: ProviderType
  displayName: string
  sendMessage(messages, options): AsyncIterableIterator<string>
  testConnection(): Promise<{ connected: boolean; error?: string }>
}
```

**Providers**:
- **Anthropic**: Uses `@anthropic-ai/sdk` directly with streaming
- **OpenAI**: Uses Vercel AI SDK (`@ai-sdk/openai`, `ai`)

**Client** (`src/ai/client.ts`): High-level operations wrapping the provider interface.

**Prompts** (`src/ai/prompts.ts`): Builds system prompts with project context, workflow rules, and focused file content.

### Core Systems

#### Chat Persistence (`src/core/chat/`)

Stores chat history in `.ai/logs/` within each project folder:
- Files named by ISO timestamp: `2025-01-02T10-30-00.md`
- Markdown format with YAML frontmatter
- Supports listing, loading, saving, deleting chat logs

#### Project Snapshots (`src/core/project/`)

`ProjectSnapshot` captures deterministic project state:
- File existence, size, modification time
- Template fill status: `missing | template_only | thin | filled`
- Health assessment: missing files, thin files, config issues
- Readiness assessment for workflow gating
- AI config from `.ai/config.json` (GitHub repo URL, etc.)

#### Workflows (`src/core/workflows/definitions.ts`)

Each workflow has:
- `readFiles` / `writeFiles`: File boundaries
- `risk`: low | medium | high
- `confirmation`: none | preview | confirm
- `allowsDelete`, `allowsCrossFileMove`: Operation permissions
- `rules`: Specific behavioral constraints for AI
- `usesAI`: Whether it requires AI processing

### GitHub Integration (`src/github/`)

- **URL parsing**: Supports HTTPS, SSH, and shorthand formats
- **Commit fetching**: Paginated REST API calls
- **Token support**: For private repos or higher rate limits

### UI Components (`src/ui/components/`)

Extracted reusable components for the existing project modal:
- **ChatInterface**: Message display, input, streaming response
- **ChatSidebar**: Chat history list with load/delete
- **WorkflowExecutor**: Workflow selection and execution
- **IssuesPanel**: Project health issues display

## Workflows

### Active Workflows

| Workflow | Display Name | Description |
|----------|--------------|-------------|
| `title-entries` | Log: Title Entries | Add short titles (1-5 words) to log entries |
| `generate-tasks` | Log: Generate Tasks | Extract 0-3 potential tasks per log entry |
| `groom-tasks` | Log: Groom Tasks | Review/move AI-generated potential tasks |
| `fill-overview` | Overview: Fill | AI-guided session to fill Overview.md |
| `roadmap-fill` | Roadmap: Fill | AI-guided session to fill Roadmap.md |
| `tasks-fill` | Tasks: Fill | AI-guided session to fill Tasks.md |
| `harvest-tasks` | Tasks: Harvest Tasks | Find actionable items across all files |
| `ideas-groom` | Ideas: Groom Tasks | Extract tasks from Ideas.md |
| `sync-commits` | Tasks: Sync Commits | Match git commits to tasks |
| `archive-completed` | Tasks: Archive Completed | Move completed tasks to Archive.md |

### Workflow File Boundaries

- **Log workflows**: Read/write `Log.md` only
- **Fill workflows**: Read multiple files, write single target file
- **Harvest/Groom**: Read multiple, write `Tasks.md`
- **Sync commits**: Read `Tasks.md`, `Archive.md`, write both
- **Archive**: Read/write `Tasks.md` and `Archive.md`

## Project Documentation Files

When scaffolded, projects contain these files in `<projectsFolder>/<ProjectName>/`:

| File | Purpose |
|------|---------|
| `Overview.md` | North star: elevator pitch, problem, users, scope, constraints |
| `Roadmap.md` | Milestones, vertical slices, current focus |
| `Tasks.md` | Next actions, active tasks, blocked items, future tasks |
| `Log.md` | Freeform progress notes and thinking |
| `Ideas.md` | Scratch ideas and open questions |
| `Archive.md` | Completed work, superseded plans, rejected ideas |

### Hidden Folder: `.ai/`

Each project can have an `.ai/` folder containing:
- `config.json`: Project-specific settings (`github_repo`, etc.)
- `logs/`: Persisted chat history as markdown files

## Data Flow

### New Project Interview

1. User starts interview → `InterviewModal`
2. AI guides through discovery phases
3. On completion → `Scaffolder` creates project files
4. Files populated with interview insights

### Existing Project Session

1. User opens project → `ExistingProjectModal`
2. `SnapshotBuilder` captures current state
3. `IssuesPanel` shows health issues
4. `ChatInterface` enables conversation with project context
5. `WorkflowExecutor` runs automated maintenance
6. Results shown in `DiffViewerModal` for approval

### Workflow Execution

1. User selects workflow
2. System prompt built with workflow rules + project context
3. AI generates structured output (JSON or diff)
4. Parser extracts changes
5. User reviews in modal
6. Approved changes written to files

## Verification

After making changes:

1. Run `bun run typecheck`
2. Run `bun run build` to verify the build
3. Test in Obsidian:
   - Run `bun run build:deploy` (if vault path configured), OR
   - Copy `dist/main.js`, `manifest.json`, `styles.css` to `<vault>/.obsidian/plugins/lachesis/`
4. Enable plugin in Obsidian settings
5. Click brain-circuit icon or use command palette

## Key Conventions

### TypeScript

- Strict mode enabled
- Use `type` for type definitions (not `interface` unless extending)
- Prefer explicit return types on exported functions
- Import types with `import type { ... }` when possible

### File Organization

- One main export per file
- Group related types in `types.ts` files
- Use `index.ts` for public API re-exports
- Keep parsers separate from UI code

### AI Integration

- All AI responses stream through the provider interface
- System prompts include project snapshot + workflow rules
- Structured output uses JSON with specific schemas per workflow
- Diffs use standard unified format

### Error Handling

- Use `Result<T>` pattern for GitHub API calls
- Try/catch around file operations
- User-facing errors shown via Obsidian `Notice`
- Console logging for debugging

### State Management

- No external state library
- Modal classes hold their own state
- Chat history persisted to filesystem
- Project state refreshed via snapshot on open

## Adding a New Workflow

1. Add definition to `src/core/workflows/definitions.ts`
2. Create parser in `src/utils/<workflow>-parser.ts` if needed
3. Create modal in `src/ui/<workflow>-modal.ts` if custom UI needed
4. Add workflow to UI selector in `workflow-executor.ts`
5. Handle in `existing-project-modal.ts` execution logic
