# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is
An Obsidian plugin that helps users plan projects through AI-powered interviews, generating structured project documentation within their Obsidian vault.

## Project Structure
```
lachesis/
├── src/             # TypeScript source
│   ├── ai/          # AI providers and client
│   ├── core/        # Core logic (sessions, projects, workflows)
│   ├── scaffolder/  # File scaffolding
│   └── ui/          # Obsidian modals
├── manifest.json    # Plugin manifest
├── styles.css       # Plugin styles
└── package.json     # Dependencies
```

## Commands
```bash
npm install              # Install dependencies
npm run dev              # Build in watch mode
npm run build            # Production build
npm run typecheck        # Type check
```

## Architecture

### Plugin Entry
- **Entry point**: `src/main.ts` — Registers ribbon icon, commands, settings tab
- **Settings**: `src/settings.ts` — Multi-provider settings (Anthropic/OpenAI)

### AI System
- **Provider abstraction**: `src/ai/providers/types.ts` — Common interface
- **Provider factory**: `src/ai/providers/factory.ts` — Creates providers from settings
- **Anthropic provider**: `src/ai/providers/anthropic/index.ts`
- **OpenAI provider**: `src/ai/providers/openai/index.ts`
- **Client**: `src/ai/client.ts` — High-level AI operations
- **Prompts**: `src/ai/prompts.ts` — System prompt builder

### Core Logic
- **Sessions**: `src/core/session/` — Session state machine, conversation management
- **Projects**: `src/core/project/` — Project types, snapshot builder
- **Workflows**: `src/core/workflows/` — 6 named workflows (synthesize, harvest-tasks, etc.)

### UI
- **Interview modal**: `src/ui/interview-modal.ts` — New project interview flow
- **Project picker**: `src/ui/project-picker-modal.ts` — List/select existing projects
- **Existing project modal**: `src/ui/existing-project-modal.ts` — Continue existing projects

### Scaffolder
- **Scaffolder**: `src/scaffolder/scaffolder.ts` — Creates project files
- **Templates**: `src/scaffolder/templates.ts` — Markdown templates

## AI Provider System
Supports two providers (configurable in settings):
- **Anthropic SDK**: Claude models via `@anthropic-ai/sdk`
- **OpenAI**: GPT models via Vercel AI SDK (`@ai-sdk/openai`)

Default: Anthropic with Claude Sonnet 4

## Project Documentation Files
When a project is scaffolded, these files are created:
1. **Overview.md** — Project north star (elevator pitch, problem, users, scope)
2. **Roadmap.md** — Milestones and current focus
3. **Tasks.md** — Actionable work items
4. **Log.md** — Progress notes and thinking
5. **Ideas.md** — Scratch ideas and open questions
6. **Archive.md** — Historical record

## Named Workflows
Six workflows for existing project management:
1. **Synthesize** — Light polish for clarity and consistency
2. **Harvest Tasks** — Extract actionable items from Log/Ideas → Tasks
3. **Triage** — Organize Tasks.md into executable priority order
4. **Log Digest** — Add titles to untitled log entries
5. **Align Templates** — Ensure file structure matches current templates
6. **Archive Pass** — Move completed or cut work to Archive

## Verification
After making changes:
1. Run `npm run typecheck`
2. Run `npm run build` to verify the build
3. Copy `main.js`, `manifest.json`, and `styles.css` to an Obsidian vault's `.obsidian/plugins/lachesis/` folder to test

## Testing in Obsidian
1. Build the plugin: `npm run build`
2. Create plugin folder: `<vault>/.obsidian/plugins/lachesis/`
3. Copy files: `main.js`, `manifest.json`, `styles.css`
4. Enable the plugin in Obsidian settings
5. Click the brain icon or use command palette: "Lachesis: Open project picker"
