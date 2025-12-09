# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install          # Install dependencies
bun run index.ts     # Run the application
bun run <file>.ts    # Run any TypeScript file directly
```

## Tech Stack

- **Runtime**: Bun (v1.3.4+)
- **Language**: TypeScript with strict mode enabled
- **Module System**: ESNext with bundler resolution

## TypeScript Configuration

Strict TypeScript settings are enabled:
- `noUncheckedIndexedAccess`: Array/object index access returns `T | undefined`
- `noImplicitOverride`: Requires explicit `override` keyword
- `noFallthroughCasesInSwitch`: Prevents switch fallthrough bugs
