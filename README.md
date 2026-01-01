# Lachesis

An Obsidian plugin for AI-powered project planning interviews that scaffold structured project documentation.

## Features

- **AI-Powered Project Planning**: Conversational interface to explore and refine your project ideas
- **Structured Output**: Generates organized markdown files compatible with Obsidian
- **Multi-Provider Support**: Works with Anthropic (Claude) and OpenAI models
- **Project Management**: Continue existing projects, analyze health, run named workflows
- **JARVIS Persona**: Polished, formal British butler voice for all interactions

## Installation

### Manual Installation

1. Download the latest release (or build from source)
2. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/lachesis/` folder
3. Enable the plugin in Obsidian settings
4. Configure your API key in the plugin settings

### Building from Source

```bash
npm install
npm run build
```

## Usage

### New Project Interview

1. Click the brain icon in the ribbon (or use command palette: "Lachesis: Start new project interview")
2. Select your planning level (Light spark / Some notes / Well defined)
3. Answer questions about your project idea
4. Choose a project name from suggestions (or enter your own)
5. Project files are scaffolded in your configured projects folder

### Continue Existing Project

1. Click the brain icon in the ribbon (or use command palette: "Lachesis: Open project picker")
2. Select a project from the list
3. Chat with Lachesis about your project
4. Run workflows to organize and maintain your project files

## Configuration

Open Obsidian Settings > Lachesis to configure:

- **Provider**: Anthropic (Claude) or OpenAI
- **API Key**: Your provider's API key
- **Model**: Which model to use for conversations
- **Projects Folder**: Where to create new projects

## Generated Project Structure

When a project is scaffolded, these files are created:

```
ProjectName/
├── Overview.md      # Project north star (elevator pitch, problem, users, scope)
├── Roadmap.md       # Milestones and current focus
├── Tasks.md         # Actionable work items
├── Log.md           # Progress notes and thinking
├── Ideas.md         # Scratch ideas and open questions
└── Archive.md       # Historical record
```

## Named Workflows

For existing projects, Lachesis supports six named workflows:

| Workflow | Description |
|----------|-------------|
| **Synthesize** | Light polish for clarity and consistency |
| **Harvest Tasks** | Extract actionable items from Log/Ideas → Tasks |
| **Triage** | Organize Tasks.md into executable priority order |
| **Log Digest** | Add titles to untitled log entries |
| **Align Templates** | Ensure file structure matches current templates |
| **Archive Pass** | Move completed or cut work to Archive |

## Development

```bash
# Install dependencies
npm install

# Development build (watch mode)
npm run dev

# Production build
npm run build

# Type check
npm run typecheck
```

### Testing in Obsidian

1. Run `npm run build`
2. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/lachesis/`
3. Reload Obsidian (Cmd+R / Ctrl+R)
4. Enable the plugin if not already enabled

## License

MIT
