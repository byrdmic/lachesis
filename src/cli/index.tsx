#!/usr/bin/env bun
import { render } from 'ink'
import React from 'react'
import { App } from '../ui/App.tsx'

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
  lachesis start     Launch Lachesis and choose a workflow
  lachesis new       Start a new project planning session
  lachesis help      Show this help message
  lachesis version   Show version

Options:
  --help, -h         Show help
  --version, -v      Show version
  --debug, -d        Enable debug mode with log panel
`)
}

function showVersion() {
  console.log('Lachesis v0.1.0')
}

// Handle commands
switch (command) {
  case 'start':
    render(<App command="start" debug={debug} />)
    break

  case 'new':
    render(<App command="new" debug={debug} />)
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
