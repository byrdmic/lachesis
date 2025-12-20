// Session CLI commands
// Provides command-line interface for session operations

import { loadConfig } from '../../config/config.ts'
import type { LachesisConfig } from '../../config/types.ts'
import {
  createSessionManager,
  listSessions,
  getSession,
  streamQuestion,
  processUserMessage,
  generateNameSuggestions,
  finalizeSession,
  getStepDescription,
} from '../../core/session/index.ts'
import type {
  SessionStartOutput,
  SessionMessageOutput,
  SessionStatusOutput,
  SessionListOutput,
  SessionFinalizeOutput,
  SessionState,
  SessionEvent,
} from '../../core/session/index.ts'

// ============================================================================
// Config Helper
// ============================================================================

function getConfig(): LachesisConfig {
  const result = loadConfig()
  if (result.status === 'error') {
    console.error(`Config error: ${result.error}`)
    process.exit(1)
  }
  return result.config
}

// ============================================================================
// Output Helpers
// ============================================================================

function outputJSON(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}

function outputNDJSON(event: SessionEvent): void {
  console.log(JSON.stringify(event))
}

function parseArgs(args: string[]): Map<string, string | boolean> {
  const parsed = new Map<string, string | boolean>()
  let i = 0

  while (i < args.length) {
    const arg = args[i]
    if (!arg) {
      i++
      continue
    }

    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const nextArg = args[i + 1]
      // Check if next arg is a value (not another flag)
      if (nextArg && !nextArg.startsWith('--')) {
        parsed.set(key, nextArg)
        i += 2
      } else {
        parsed.set(key, true)
        i++
      }
    } else {
      // Positional argument
      if (!parsed.has('_positional')) {
        parsed.set('_positional', arg)
      }
      i++
    }
  }

  return parsed
}

// ============================================================================
// Session Commands
// ============================================================================

/**
 * session start [--planning-level <level>] [--name <name>] [--one-liner <desc>]
 */
export async function sessionStart(args: string[]): Promise<void> {
  const parsed = parseArgs(args)
  const planningLevel = (parsed.get('planning-level') as string) || 'medium'
  const projectName = (parsed.get('name') as string) || ''
  const oneLiner = (parsed.get('one-liner') as string) || ''
  const stream = parsed.get('stream') === true

  const config = getConfig()
  const manager = createSessionManager(config)

  const session = await manager.createSession({
    type: 'new_project',
    planningLevel,
    projectName,
    oneLiner,
  })

  // If streaming, generate the first question with streaming output
  if (stream) {
    await streamQuestion({
      sessionId: session.id,
      config,
      onStreamUpdate: (partial) => {
        outputNDJSON({ type: 'ai_streaming', partial })
      },
      onEvent: (event) => {
        if (event.type !== 'ai_streaming') {
          outputNDJSON(event)
        }
      },
    })

    // Get final state and output as regular JSON (not typed event)
    const finalSession = getSession(session.id)
    if (finalSession) {
      console.log(JSON.stringify({ type: 'session_state', state: formatSessionOutput(finalSession) }))
    }
  } else {
    // Generate first question without streaming
    await streamQuestion({
      sessionId: session.id,
      config,
    })

    const finalSession = getSession(session.id)
    const output: SessionStartOutput = {
      sessionId: session.id,
      type: session.type,
      step: finalSession?.step ?? session.step,
      planningLevel: session.planningLevel,
      createdAt: session.createdAt,
    }
    outputJSON(output)
  }
}

/**
 * session message <sessionId> --message "<text>" [--stream]
 */
export async function sessionMessage(args: string[]): Promise<void> {
  const parsed = parseArgs(args)
  const sessionId = parsed.get('_positional') as string
  const message = parsed.get('message') as string
  const stream = parsed.get('stream') === true

  if (!sessionId) {
    console.error('Error: Session ID is required')
    console.error('Usage: lachesis session message <sessionId> --message "your message"')
    process.exit(1)
  }

  if (!message) {
    console.error('Error: Message is required')
    console.error('Usage: lachesis session message <sessionId> --message "your message"')
    process.exit(1)
  }

  const session = getSession(sessionId)
  if (!session) {
    console.error(`Error: Session not found: ${sessionId}`)
    process.exit(1)
  }

  const config = getConfig()

  if (stream) {
    await processUserMessage(sessionId, message, config, {
      onStreamUpdate: (partial) => {
        outputNDJSON({ type: 'ai_streaming', partial })
      },
      onEvent: (event) => {
        if (event.type !== 'ai_streaming') {
          outputNDJSON(event)
        }
      },
    })

    const finalSession = getSession(sessionId)
    if (finalSession) {
      console.log(JSON.stringify({ type: 'session_state', state: formatSessionOutput(finalSession) }))
    }
  } else {
    await processUserMessage(sessionId, message, config)

    const finalSession = getSession(sessionId)
    if (!finalSession) {
      console.error('Error: Session lost during message processing')
      process.exit(1)
    }

    const output: SessionMessageOutput = {
      sessionId: finalSession.id,
      step: finalSession.step,
      response: getLastAssistantMessage(finalSession),
      messages: finalSession.messages,
      coveredTopics: finalSession.coveredTopics,
    }
    outputJSON(output)
  }
}

/**
 * session status <sessionId>
 */
export async function sessionStatus(args: string[]): Promise<void> {
  const parsed = parseArgs(args)
  const sessionId = parsed.get('_positional') as string

  if (!sessionId) {
    console.error('Error: Session ID is required')
    console.error('Usage: lachesis session status <sessionId>')
    process.exit(1)
  }

  const session = getSession(sessionId)
  if (!session) {
    console.error(`Error: Session not found: ${sessionId}`)
    process.exit(1)
  }

  const output: SessionStatusOutput = session
  outputJSON(output)
}

/**
 * session list
 */
export async function sessionList(): Promise<void> {
  const sessions = listSessions()

  const output: SessionListOutput = {
    sessions: sessions.map((s) => ({
      id: s.id,
      type: s.type,
      step: s.step,
      projectName: s.projectName || s.selectedName,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  }
  outputJSON(output)
}

/**
 * session finalize <sessionId> [--name "<name>"] [--vault-path "<path>"]
 */
export async function sessionFinalize(args: string[]): Promise<void> {
  const parsed = parseArgs(args)
  const sessionId = parsed.get('_positional') as string
  const name = parsed.get('name') as string
  const vaultPathArg = parsed.get('vault-path') as string

  if (!sessionId) {
    console.error('Error: Session ID is required')
    console.error('Usage: lachesis session finalize <sessionId> [--name "Project Name"] [--vault-path "/path/to/vault"]')
    process.exit(1)
  }

  const session = getSession(sessionId)
  if (!session) {
    console.error(`Error: Session not found: ${sessionId}`)
    process.exit(1)
  }

  const config = getConfig()
  const vaultPath = vaultPathArg || config.vaultPath

  // If no name provided, generate suggestions first
  let projectName = name
  if (!projectName) {
    const suggestionsResult = await generateNameSuggestions(sessionId, config)
    if (suggestionsResult.success && suggestionsResult.data && suggestionsResult.data.length > 0) {
      // Use first suggestion
      projectName = suggestionsResult.data[0]?.name || 'Untitled Project'
    } else {
      projectName = session.projectName || 'Untitled Project'
    }
  }

  const result = await finalizeSession(
    sessionId,
    projectName,
    false, // Not custom input if using --name flag
    config,
    vaultPath,
    (event) => {
      // Log events for debugging
      if (event.type === 'step_changed') {
        console.error(`Step: ${getStepDescription(event.step)}`)
      }
    },
  )

  const finalSession = getSession(sessionId)

  const output: SessionFinalizeOutput = {
    sessionId,
    step: finalSession?.step ?? 'error',
    projectPath: result.data?.projectPath,
    extractedData: result.data?.extractedData,
    error: result.error,
  }
  outputJSON(output)

  if (!result.success) {
    process.exit(1)
  }
}

/**
 * session names <sessionId>
 * Generate name suggestions for a session
 */
export async function sessionNames(args: string[]): Promise<void> {
  const parsed = parseArgs(args)
  const sessionId = parsed.get('_positional') as string

  if (!sessionId) {
    console.error('Error: Session ID is required')
    console.error('Usage: lachesis session names <sessionId>')
    process.exit(1)
  }

  const session = getSession(sessionId)
  if (!session) {
    console.error(`Error: Session not found: ${sessionId}`)
    process.exit(1)
  }

  const config = getConfig()
  const result = await generateNameSuggestions(sessionId, config)

  if (result.success && result.data) {
    outputJSON({
      sessionId,
      suggestions: result.data,
    })
  } else {
    console.error(`Error: ${result.error || 'Failed to generate names'}`)
    process.exit(1)
  }
}

// ============================================================================
// Helpers
// ============================================================================

function formatSessionOutput(session: SessionState): Partial<SessionState> {
  return {
    id: session.id,
    type: session.type,
    step: session.step,
    planningLevel: session.planningLevel,
    projectName: session.projectName,
    selectedName: session.selectedName,
    messages: session.messages,
    coveredTopics: session.coveredTopics,
    nameSuggestions: session.nameSuggestions,
    extractedData: session.extractedData,
    scaffoldedPath: session.scaffoldedPath,
    error: session.error,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

function getLastAssistantMessage(session: SessionState): string | undefined {
  const assistantMessages = session.messages.filter((m) => m.role === 'assistant')
  return assistantMessages[assistantMessages.length - 1]?.content
}

// ============================================================================
// Command Router
// ============================================================================

export async function handleSessionCommand(args: string[]): Promise<void> {
  const subcommand = args[0]
  const subArgs = args.slice(1)

  switch (subcommand) {
    case 'start':
      await sessionStart(subArgs)
      break

    case 'message':
    case 'msg':
      await sessionMessage(subArgs)
      break

    case 'status':
      await sessionStatus(subArgs)
      break

    case 'list':
    case 'ls':
      await sessionList()
      break

    case 'finalize':
      await sessionFinalize(subArgs)
      break

    case 'names':
      await sessionNames(subArgs)
      break

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showSessionHelp()
      break

    default:
      console.error(`Unknown session subcommand: ${subcommand}`)
      showSessionHelp()
      process.exit(1)
  }
}

function showSessionHelp(): void {
  console.log(`
Session Commands - Manage conversation sessions

Usage:
  lachesis session <command> [options]

Commands:
  start [options]              Create a new session
    --planning-level <level>   Planning depth (default: medium)
    --name <name>              Initial project name
    --one-liner <desc>         One-line description
    --stream                   Stream output as NDJSON

  message <id> [options]       Send a message to a session
    --message <text>           The message to send (required)
    --stream                   Stream response as NDJSON

  status <id>                  Get session status and state

  list                         List all sessions

  names <id>                   Generate project name suggestions

  finalize <id> [options]      Complete session and scaffold project
    --name <name>              Project name (auto-generated if not provided)

Examples:
  lachesis session start --planning-level "Light spark"
  lachesis session message sess_abc123 --message "A task management app"
  lachesis session status sess_abc123
  lachesis session finalize sess_abc123 --name "TaskMaster"
`)
}
