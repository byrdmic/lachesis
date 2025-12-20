# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is
A Bun/Ink CLI that interviews a user about a project idea, generates structured project docs for an Obsidian vault, and scaffolds a folder with markdown/templates.

## Commands
```bash
bun install              # Install dependencies
bun run dev              # Run CLI (same as: bun run src/cli/index.tsx)
bun run typecheck        # Type check
bun test                 # Run all tests
bun test --watch         # Run tests in watch mode
bun test src/ai/prompts.test.ts  # Run a single test file
```

## Manual Testing
To test the app end-to-end, run the CLI commands directly:
```bash
bun run dev start        # Launch the project picker/launcher TUI
bun run dev new          # Start a new project interview directly
bun run dev start --debug  # Run with debug panel visible
```

For non-interactive CLI testing (useful for testing AI streaming, etc.):
```bash
# Start a session and get the session ID
bun run dev session start --planning-level "Quick sketch"

# Send messages to the session
bun run dev session message <sessionId> --message "A task management CLI"
bun run dev session message <sessionId> --message "For developers" --stream

# Generate name suggestions and finalize
bun run dev session names <sessionId>
bun run dev session finalize <sessionId> --name "TaskMaster"
```

## Verification Requirements

**After making changes, always verify behavior works as expected:**

1. **Run typecheck**: `bun run typecheck`
2. **Run tests**: `bun test`
3. **For AI/provider changes**: Use the non-interactive session CLI to verify:
   ```bash
   # Quick smoke test of AI streaming
   bun run dev session start --planning-level "Quick sketch"
   # Use the returned sessionId for further commands
   bun run dev session message <sessionId> --message "A simple todo app" --stream
   ```
4. **For UI/flow changes**: Run the TUI and step through the flow:
   ```bash
   bun run dev new          # Test new project interview
   bun run dev start        # Test project launcher
   ```

The non-interactive `session` commands are especially useful for testing AI behavior (prompts, streaming, provider logic) without manually clicking through the TUI.

## Architecture

### Entrypoints
- **CLI**: `src/cli/index.tsx` — commands: `start`, `new`, `help`, `version`; `--debug` shows debug panel
- **UI root**: `src/ui/App.tsx` — orchestrates config load, AI check, launcher menu, and flows

### Key modules
- **New project flow**: `src/ui/NewProject/` — interview phases (setup → AI discovery/vision → finalize)
- **Interview engine**: `src/core/interview/` — questions/phases, depth filtering
- **Project model**: `src/core/project/` — types + builder combines interview/AI output into `ProjectDefinition`
- **AI client**: `src/ai/client.ts` — unified interface; dispatches to provider implementations
- **AI providers**: `src/ai/providers/` — implementations for `anthropic`, `claude-code`, and `openai`
- **Config**: `src/config/` — types/defaults, `paths.ts` for `~/.lachesis/config.json`, load/save/validate
- **Scaffolding**: `src/fs/scaffolder.ts` — writes Obsidian-friendly files; templates in `src/fs/templates/`
- **Debug logging**: `src/debug/logger.ts`

### AI provider system
The codebase uses a provider abstraction pattern:
- `src/ai/providers/types.ts` — common interface (`AIProviderInterface`)
- `src/ai/providers/factory.ts` — `getProvider()` returns the right implementation based on config
- Provider implementations: `anthropic/`, `claude-code/`, `openai/` subdirectories
- Supported providers: `anthropic-sdk`, `claude-code` (MAX subscription), `openai` (via Vercel AI SDK)

## Configuration
- Config file: `~/.lachesis/config.json` (created on first run)
- Default provider: `anthropic-sdk` with model `claude-sonnet-4-5-20250929`
- API key env var depends on provider: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or none for claude-code
- Provider/model are user-configurable via settings UI or config file

## CLI workflow
1. `lachesis start`: loads config, shows settings, checks AI connectivity
2. New interview: collects setup, uses AI to stream questions, extracts structured data → `ProjectDefinition`
3. Scaffold: writes project folder under vault with `Overview.md`, `Roadmap.md`, `Log.md`, `Ideas.md`, `Archive.md`, `Advisors.json`, `AdvisorChat.md`, `Prompts/PROMPTS-README.md`

## Deeper reference
- AI prompts: `src/ai/prompts.ts`
- Interview phases: `src/core/interview/phases.ts`, `engine.ts`
- File templates: `src/fs/templates/*.ts`
- UI flows: `src/ui/NewProject/*.tsx`, `src/ui/ExistingProject/index.tsx`
