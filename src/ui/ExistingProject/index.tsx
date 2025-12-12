import React, { useCallback, useEffect, useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type { LachesisConfig } from '../../config/types.ts'
import { loadProjectSettings } from '../../config/project-settings.ts'
import { StatusBar } from '../components/index.ts'
import type { AIStatusDescriptor } from '../components/StatusBar.tsx'
import {
  buildProjectContext,
  serializeContextForPrompt,
} from '../../core/project/context-builder.ts'
import type { ExtractedProjectData, ConversationMessage } from '../../ai/client.ts'
import { ConversationPhase } from '../NewProject/ConversationPhase.tsx'
import { debugLog } from '../../debug/logger.ts'

/**
 * Loading progress steps for project context building
 */
type LoadingStep = 'scanning' | 'analyzing'

const LOADING_STEP_MESSAGES: Record<LoadingStep, string> = {
  scanning: 'Scanning project files...',
  analyzing: 'Analyzing project health...',
}

type ProjectSummary = {
  name: string
  path: string
  overview?: string
  updatedAt?: string
}

type ExistingProjectFlowProps = {
  config: LachesisConfig
  debug?: boolean
  onBack?: () => void
  onDebugHotkeysChange?: (enabled: boolean) => void
}

type ViewState =
  | 'list'
  | 'loading_context'
  | 'conversation'
  | 'complete'
  | 'empty'

export function ExistingProjectFlow({
  config,
  debug = false,
  onBack,
  onDebugHotkeysChange,
}: ExistingProjectFlowProps) {
  const { exit } = useApp()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [view, setView] = useState<ViewState>('list')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [projectConfig, setProjectConfig] = useState<LachesisConfig>(config)

  // AI status for status bar
  const [aiStatus, setAIStatus] = useState<AIStatusDescriptor>({
    state: 'idle',
    message: 'Ready',
  })
  const [inputLocked, setInputLocked] = useState(false)

  // Context loading state
  const [serializedContext, setSerializedContext] = useState<string | null>(null)
  const [loadingStep, setLoadingStep] = useState<LoadingStep>('scanning')

  const notifyDebugHotkeys = useCallback(
    (enabled: boolean) => onDebugHotkeysChange?.(enabled),
    [onDebugHotkeysChange],
  )

  const loadProjects = useCallback(() => {
    setLoading(true)
    setError(null)

    try {
      const vaultPath = config.vaultPath

      if (!vaultPath || vaultPath.trim() === '') {
        setError(
          'Vault path is not set. Update ~/.lachesis/config.json from settings.',
        )
        setProjects([])
        setView('empty')
        return
      }

      if (!existsSync(vaultPath)) {
        setError(`Vault path does not exist: ${vaultPath}`)
        setProjects([])
        setView('empty')
        return
      }

      const entries = readdirSync(vaultPath, { withFileTypes: true }).filter(
        (entry) => entry.isDirectory(),
      )

      const found: ProjectSummary[] = entries.map((entry) => {
        const projectPath = join(vaultPath, entry.name)
        const overviewPath = join(projectPath, 'Overview.md')

        let overview: string | undefined
        if (existsSync(overviewPath)) {
          try {
            const content = readFileSync(overviewPath, 'utf-8')
            overview = buildOverviewPreview(content)
          } catch {
            // Ignore preview errors and fall back to path-only display
          }
        }

        let updatedAt: string | undefined
        try {
          updatedAt = statSync(projectPath).mtime.toISOString()
        } catch {
          // Ignore stat errors
        }

        return {
          name: entry.name,
          path: projectPath,
          overview,
          updatedAt,
        }
      })

      // Sort newest first when timestamps are available
      found.sort((a, b) => {
        if (a.updatedAt && b.updatedAt) {
          return b.updatedAt.localeCompare(a.updatedAt)
        }
        return a.name.localeCompare(b.name)
      })

      setProjects(found)
      setSelectedIndex(0)
      setView(found.length === 0 ? 'empty' : 'list')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setView('empty')
    } finally {
      setLoading(false)
    }
  }, [config.vaultPath])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const selectedProject = projects[selectedIndex] ?? null

  useEffect(() => {
    if (
      (view === 'loading_context' || view === 'conversation' || view === 'complete') &&
      selectedProject
    ) {
      const result = loadProjectSettings(config, selectedProject.path)
      setProjectConfig(result.config)
      return
    }

    setProjectConfig(config)
  }, [config, selectedProject?.path, view])

  // Effect to build project context when entering loading_context
  useEffect(() => {
    if (view !== 'loading_context' || !selectedProject) return

    const project = selectedProject
    let cancelled = false

    async function loadContext() {
      try {
        debugLog.info('Starting project context load', {
          projectName: project.name,
          projectPath: project.path,
        })

        // Step 1: Scanning
        setLoadingStep('scanning')
        setAIStatus({ state: 'processing', message: 'Scanning project files...' })
        debugLog.info('Scanning project files', { path: project.path })

        const context = await buildProjectContext(project.path)
        if (cancelled) return

        debugLog.info('Project files scanned', {
          fileCount: context.files.length,
          files: context.files.map((f) => ({
            path: f.relativePath,
            exists: f.exists,
            health: f.health,
          })),
        })

        // Step 2: Analyzing
        setLoadingStep('analyzing')
        setAIStatus({ state: 'processing', message: 'Analyzing project health...' })
        debugLog.info('Analyzing project health', {
          overallHealth: context.health.overallHealth,
          missingCategories: context.health.missingCategories,
          weakFiles: context.health.weakFiles,
        })

        // Serialize context for the conversation
        const serialized = serializeContextForPrompt(context)
        debugLog.debug('Serialized context for AI', {
          contextLength: serialized.length,
          contextPreview: serialized.slice(0, 500),
        })

        if (cancelled) return

        setSerializedContext(serialized)
        setView('conversation')
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        const stack = err instanceof Error ? err.stack : undefined
        debugLog.error('Exception during project context load', {
          error: message,
          stack,
        })
        setError(message)
        setView('list')
      }
    }

    loadContext()

    return () => {
      cancelled = true
    }
  }, [view, selectedProject?.path])

  // Handle conversation completion
  const handleConversationComplete = useCallback(
    (
      extractedData: ExtractedProjectData,
      conversationLog: ConversationMessage[],
    ) => {
      debugLog.info('Existing project conversation complete', {
        extractedDataKeys: Object.keys(extractedData),
        messageCount: conversationLog.length,
      })
      // TODO: Could update project files with new insights here
      setView('complete')
    },
    [],
  )

  // Handle cancellation from conversation
  const handleCancel = useCallback(() => {
    if (onBack) {
      onBack()
      return
    }
    setView('list')
  }, [onBack])

  useInput(
    (input, key) => {
      const lower = input.toLowerCase()

      if (view === 'list') {
        if (key.escape && onBack) {
          onBack()
          return
        }
        if (key.upArrow || lower === 'k') {
          setSelectedIndex((idx) => Math.max(0, idx - 1))
        }
        if (key.downArrow || lower === 'j') {
          setSelectedIndex((idx) =>
            Math.min(Math.max(projects.length - 1, 0), idx + 1),
          )
        }
        if (key.return && projects.length > 0) {
          // Start loading project context
          setSerializedContext(null)
          setView('loading_context')
        }
        if (lower === 'b' && onBack) {
          onBack()
        }
        if (lower === 'q') {
          exit()
        }
      } else if (view === 'loading_context') {
        // Allow cancellation with Escape
        if (key.escape || lower === 'b') {
          setView('list')
        }
      } else if (view === 'complete') {
        if (lower === 'b') {
          setView('list')
          return
        }
        if (key.return || lower === 'q') {
          exit()
        }
      } else if (view === 'empty') {
        if (lower === 'b' && onBack) {
          onBack()
        } else if (lower === 'q' || key.return) {
          exit()
        }
      }
      // Note: 'conversation' view is handled by ConversationPhase
    },
    { isActive: !loading && !inputLocked && view !== 'conversation' },
  )

  const statusConfig =
    view === 'loading_context' || view === 'conversation' || view === 'complete'
      ? projectConfig
      : config

  // Determine if we should show project name in status bar
  const showProjectInStatusBar =
    view === 'loading_context' ||
    view === 'conversation' ||
    view === 'complete'
  const statusBarProjectName = showProjectInStatusBar
    ? selectedProject?.name
    : undefined

  const renderWithStatusBar = (content: React.ReactNode) => (
    <Box flexDirection="column" width="100%">
      {/* Main content */}
      <Box flexDirection="column">
        {content}
      </Box>
      {/* Status bar at bottom */}
      <StatusBar
        config={statusConfig}
        aiStatus={aiStatus}
        showSettingsHint={false}
        projectName={statusBarProjectName}
      />
    </Box>
  )
  const formattedProjects = projects.map((project) => {
    const overviewSnippet = project.overview?.split('\n')[0] ?? ''
    const updatedLabel = project.updatedAt
      ? `Updated ${new Date(project.updatedAt).toLocaleDateString()}`
      : ''

    return {
      ...project,
      overviewSnippet,
      updatedLabel,
    }
  })

  const nameWidth = formattedProjects.reduce(
    (max, project) => Math.max(max, project.name.length),
    0,
  )
  const updatedWidth = formattedProjects.reduce(
    (max, project) => Math.max(max, project.updatedLabel.length),
    0,
  )
  const overviewWidth = formattedProjects.reduce(
    (max, project) => Math.max(max, project.overviewSnippet.length),
    0,
  )

  if (loading) {
    return (
      renderWithStatusBar(
        <Box padding={1}>
          <Text color="cyan">Scanning your vault for projects...</Text>
        </Box>,
      )
    )
  }

  if (view === 'empty') {
    const vaultLabel = config.vaultPath || 'your configured vault'
    return (
      renderWithStatusBar(
        <Box padding={1} flexDirection="column">
          <Text bold>No projects found in {vaultLabel}</Text>
          {error && <Text color="red">{error}</Text>}
          <Text>{'\n'}</Text>
          <Text dimColor>
            Create a project first, or press [B] to go back / [Q] to quit.
          </Text>
        </Box>,
      )
    )
  }

  if (view === 'loading_context' && selectedProject) {
    const steps: LoadingStep[] = ['scanning', 'analyzing']
    const currentStepIndex = steps.indexOf(loadingStep)

    return (
      renderWithStatusBar(
        <Box padding={1} flexDirection="column">
          <Text color="cyan" bold>
            Loading project context...
          </Text>
          <Text>{'\n'}</Text>

          {/* Progress steps */}
          <Box flexDirection="column" marginLeft={1}>
            {steps.map((step, idx) => {
              const isComplete = idx < currentStepIndex
              const isCurrent = idx === currentStepIndex

              let icon = '○'
              let color: string | undefined = 'gray'
              if (isComplete) {
                icon = '✓'
                color = 'green'
              } else if (isCurrent) {
                icon = '●'
                color = 'cyan'
              }

              return (
                <Box key={step}>
                  <Text color={color}>
                    {icon} {LOADING_STEP_MESSAGES[step]}
                  </Text>
                </Box>
              )
            })}
          </Box>

          <Text>{'\n'}</Text>
          <Text dimColor>Press Esc to cancel.</Text>
        </Box>,
      )
    )
  }

  if (view === 'conversation' && selectedProject && serializedContext) {
    return (
      renderWithStatusBar(
        <ConversationPhase
          config={projectConfig}
          planningLevel="Existing project"
          projectName={selectedProject.name}
          oneLiner={selectedProject.overview?.split('\n')[0] || 'Existing project'}
          debug={debug}
          sessionKind="existing"
          projectContext={serializedContext}
          onInputModeChange={setInputLocked}
          onAIStatusChange={setAIStatus}
          onDebugHotkeysChange={notifyDebugHotkeys}
          onComplete={handleConversationComplete}
          onCancel={handleCancel}
        />,
      )
    )
  }

  if (view === 'complete' && selectedProject) {
    return (
      renderWithStatusBar(
        <Box padding={1} flexDirection="column">
          <Text color="green" bold>
            Session complete
          </Text>
          <Text>{selectedProject.name}</Text>
          <Text color="cyan">{selectedProject.path}</Text>
          <Text>{'\n'}</Text>
          <Text dimColor>
            Press [B] to go back to project list, or [Q] to quit.
          </Text>
        </Box>,
      )
    )
  }

  // Default: list view
  return (
    renderWithStatusBar(
      <Box padding={1} flexDirection="column" flexGrow={1}>
        <Text bold>Select an existing project</Text>
        <Text dimColor>
          Use ↑/↓ to navigate, Enter to view, [B] back, [Q] quit.
        </Text>
        <Text dimColor>
          Vault: {config.vaultPath || 'Not set - update in settings'}
        </Text>
        <Text>{'\n'}</Text>

        {formattedProjects.map((project, idx) => {
          const isSelected = idx === selectedIndex
          const prefix = isSelected ? '❯ ' : '  '
          const paddedName = project.name.padEnd(nameWidth)
          const paddedUpdated =
            updatedWidth > 0 ? project.updatedLabel.padEnd(updatedWidth) : ''
          const paddedOverview =
            overviewWidth > 0
              ? project.overviewSnippet.padEnd(overviewWidth)
              : project.overviewSnippet

          return (
            <Text key={project.path} color={isSelected ? 'cyan' : undefined}>
              {prefix}
              {paddedName}
              {updatedWidth > 0 && (
                <>
                  {'  '}
                  <Text dimColor>{paddedUpdated}</Text>
                </>
              )}
              {overviewWidth > 0 && (
                <>
                  {'  '}
                  <Text dimColor>{paddedOverview}</Text>
                </>
              )}
            </Text>
          )
        })}
      </Box>,
    )
  )
}

function buildOverviewPreview(content: string): string {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '')
  return lines.slice(0, 5).join('\n')
}

