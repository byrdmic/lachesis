# CLAUDE.md

What this project is: a Bun/Ink CLI that interviews a user about a project idea, generates structured project docs for an Obsidian vault, and scaffolds a folder with markdown/templates.

## How to run (always Bun)
- Install deps: `bun install`
- Dev/run CLI: `bun run src/cli/index.tsx` (same as `lachesis start` after linking)
- Type check: `bun run typecheck`

## Entrypoints & structure (read first)
- CLI entry: `src/cli/index.tsx` (commands: `start`, `new`, `help`, `version`; `--debug` shows debug panel).
- UI (Ink/React): `src/ui/App.tsx` orchestrates config load, AI check, launcher menu, and flows.
- New project flow: `src/ui/NewProject/` handles interview phases (setup → AI discovery/vision → finalize).
- Interview logic: `src/core/interview/` (questions/phases, depth filtering).
- Project model/building: `src/core/project/` (types + `builder.ts` combines interview/AI output into `ProjectDefinition`).
- AI integration: `src/ai/client.ts` (OpenAI via `@ai-sdk/openai`/`ai`; generation, streaming, extraction, summary).
- Config: `src/config/` (types/defaults, `paths.ts` for `~/.lachesis/config.json`, `config.ts` load/save/validate).
- Scaffolding: `src/fs/scaffolder.ts` writes Obsidian-friendly files; content templates in `src/fs/templates/`.
- UI components/utilities: `src/ui/components/`, logging in `src/debug/logger.ts`.

## Configuration & keys
- Config file lives at `~/.lachesis/config.json`; created on first run with OS-detected vault path (`~/Documents/Obsidian/Projects` by default) and defaults from `src/config/types.ts`.
- Default AI provider/model: OpenAI `openai/gpt-5` with env var `OPENAI_API_KEY` (`apiKeyEnvVar` in config). Model/provider are user-configurable; code handles missing/invalid keys with helpful errors.
- Vault path must be set to an existing/desired Obsidian workspace before scaffolding; update via settings in the UI or by editing the config file.

## Typical workflow (what the CLI does)
1) Start (`lachesis start`): loads config, optionally shows settings, checks AI connectivity.  
2) New interview: collects setup info, uses AI to generate/stream next questions, then extracts structured data and builds a `ProjectDefinition`.  
3) Finalize/scaffold: writes project folder under the configured vault with `Overview.md`, `Roadmap.md`, `Log.md`, `Idea.md`, `Archive.md`, `Advisors.json`, `AdvisorChat.md`, and `Prompts/PROMPTS-README.md`.

## Progressive disclosure: where to look for details
- AI prompts/behavior: `src/ai/client.ts`, `src/ai/prompts.ts`.
- Interview content/phases: `src/core/interview/phases.ts` and `engine.ts`.
- Templates for generated files: `src/fs/templates/*.ts`.
- UI flow specifics: `src/ui/NewProject/*.tsx`, `src/ui/ExistingProject/index.tsx`.

## Testing/verification
- Run `bun run typecheck` after changes.
- No automated tests exist; manual verification is via running the CLI in dev mode (`bun run src/cli/index.tsx`) and stepping through `start`/`new`.
