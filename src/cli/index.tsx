#!/usr/bin/env bun
import { render } from 'ink'
import React from 'react'
import { App } from '../ui/App.tsx'
import { debugLog } from '../debug/logger.ts'
import { handleSessionCommand } from './commands/session.ts'

// Enable file logging for all sessions
debugLog.enableFileLogging()
debugLog.info('Lachesis CLI started', {
  args: process.argv.slice(2),
  nodeVersion: process.version,
  platform: process.platform,
})

// Parse command line arguments
const args = process.argv.slice(2)

// Check for debug flag anywhere in args
const debugIndex = args.findIndex((arg) => arg === '--debug' || arg === '-d')
const debug = debugIndex !== -1

// Remove debug flag from args if present
const filteredArgs = args.filter((_, i) => i !== debugIndex)
const command = filteredArgs[0]

function showHelp() {
  console.log(`
Lachesis - Project Foundations Studio

Usage:
  lachesis start           Launch Lachesis TUI and choose a workflow
  lachesis new             Start a new project planning session (TUI)
  lachesis session <cmd>   Session commands (CLI backend)
  lachesis help            Show this help message
  lachesis version         Show version

Session Commands (CLI backend):
  lachesis session start       Create a new session
  lachesis session message     Send a message to a session
  lachesis session status      Get session status
  lachesis session list        List all sessions
  lachesis session finalize    Complete and scaffold project
  lachesis session help        Show session command help

Options:
  --help, -h         Show help
  --version, -v      Show version
  --debug, -d        Enable debug mode with log panel (TUI only)
`)
}

function showVersion() {
  console.log('Lachesis v0.1.0')
}

// Handle commands
async function main() {
  switch (command) {
    case 'start':
      render(<App command="start" debug={debug} />)
      break

    case 'new':
      render(<App command="new" debug={debug} />)
      break

    case 'session':
      // Pass remaining args to session command handler
      await handleSessionCommand(filteredArgs.slice(1))
      break

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showHelp()
      break

    case 'version':
    case '--version':
    case '-v':
      showVersion()
      break

    default:
      console.log(`Unknown command: ${command}`)
      console.log('Run "lachesis help" for usage information.')
      process.exit(1)
  }
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
