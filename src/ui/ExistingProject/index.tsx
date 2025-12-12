import React, { useCallback, useEffect, useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type { LachesisConfig } from '../../config/types.ts'
import { loadProjectSettings } from '../../config/project-settings.ts'
import { StatusBar } from '../components/index.ts'
import { ProjectBriefingCard } from './ProjectBriefingCard.tsx'
import { BriefingActionMenu } from './BriefingActionMenu.tsx'
import {
  buildProjectContext,
  serializeContextForPrompt,
} from '../../core/project/context-builder.ts'
import { buildLoadProjectPrompt } from '../../ai/prompts.ts'
import {
  generateProjectBriefing,
  type AIBriefingResponse,
} from '../../ai/client.ts'
import type {
  LoadProjectAction,
  ProjectContextPackage,
} from '../../core/project/context.ts'
import { debugLog } from '../../debug/logger.ts'

/**
 * Loading progress steps for the briefing generation
 */
type LoadingStep =
  | 'scanning'
  | 'analyzing'
  | 'sending'
  | 'waiting'
  | 'processing'

const LOADING_STEP_MESSAGES: Record<LoadingStep, string> = {
  scanning: 'Scanning project files...',
  analyzing: 'Analyzing project health...',
  sending: 'Sending context to AI...',
  waiting: 'Waiting for AI response...',
  processing: 'Processing briefing...',
}

type ProjectSummary = {
  name: string
  path: string
  overview?: string
  updatedAt?: string
}

type ExistingProjectFlowProps = {
  config: LachesisConfig
  onBack?: () => void
}

type ViewState =
  | 'list'
  | 'detail'
  | 'loading_briefing'
  | 'briefing'
  | 'loaded'
  | 'empty'

export function ExistingProjectFlow({ config, onBack }: ExistingProjectFlowProps) {
  const { exit } = useApp()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [view, setView] = useState<ViewState>('list')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [projectConfig, setProjectConfig] = useState<LachesisConfig>(config)
  const [projectSettings, setProjectSettings] = useState<{
    found: boolean
    overrides: Partial<LachesisConfig>
    warnings: string[]
    error?: string
    settingsPath?: string
  }>({
    found: false,
    overrides: {},
    warnings: [],
  })

  // Briefing state
  const [briefing, setBriefing] = useState<AIBriefingResponse | null>(null)
  const [briefingError, setBriefingError] = useState<string | null>(null)
  const [projectContext, setProjectContext] =
    useState<ProjectContextPackage | null>(null)
  const [loadingStep, setLoadingStep] = useState<LoadingStep>('scanning')

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
      (view === 'detail' || view === 'loaded' || view === 'briefing') &&
      selectedProject
    ) {
      const result = loadProjectSettings(config, selectedProject.path)
      setProjectConfig(result.config)
      setProjectSettings({
        found: result.found,
        overrides: result.overrides,
        warnings: result.warnings,
        error: result.error,
        settingsPath: result.settingsPath,
      })
      return
    }

    setProjectConfig(config)
    setProjectSettings({
      found: false,
      overrides: {},
      warnings: [],
      error: undefined,
      settingsPath: undefined,
    })
  }, [config, selectedProject?.path, view])

  // Effect to build context and generate briefing when entering loading_briefing
  useEffect(() => {
    if (view !== 'loading_briefing' || !selectedProject) return

    // Capture selectedProject for use in async function
    const project = selectedProject
    let cancelled = false

    async function loadBriefing() {
      try {
        debugLog.info('Starting project load', {
          projectName: project.name,
          projectPath: project.path,
        })

        // Step 1: Scanning
        setLoadingStep('scanning')
        debugLog.info('Scanning project files', { path: project.path })

        // Build project context
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
        debugLog.info('Analyzing project health', {
          overallHealth: context.health.overallHealth,
          missingCategories: context.health.missingCategories,
          weakFiles: context.health.weakFiles,
        })

        setProjectContext(context)

        // Serialize context for the prompt
        const serialized = serializeContextForPrompt(context)
        debugLog.debug('Serialized context for AI', {
          contextLength: serialized.length,
          contextPreview: serialized.slice(0, 500),
        })

        const prompt = buildLoadProjectPrompt(serialized)
        debugLog.debug('Built load project prompt', {
          promptLength: prompt.length,
        })

        // Step 3: Sending
        setLoadingStep('sending')
        debugLog.info('Sending request to AI', {
          provider: projectConfig.defaultProvider,
          model: projectConfig.defaultModel,
        })

        // Step 4: Waiting
        setLoadingStep('waiting')

        // Generate briefing from AI
        const result = await generateProjectBriefing(
          serialized,
          prompt,
          projectConfig,
        )

        if (cancelled) return

        // Step 5: Processing
        setLoadingStep('processing')

        if (result.success && result.briefing) {
          debugLog.info('Received AI briefing', {
            greeting: result.briefing.greeting,
            recommendationCount: result.briefing.recommendations.length,
            actionCount: result.briefing.suggestedActions.length,
          })
          debugLog.debug('Full AI briefing response', {
            briefing: result.briefing,
          })

          setBriefing(result.briefing)
          setBriefingError(null)
          setView('briefing')
        } else {
          debugLog.error('Failed to generate briefing', {
            error: result.error,
            debugDetails: result.debugDetails,
          })
          setBriefingError(result.error || 'Failed to generate briefing')
          // Fall back to loaded view on error
          setView('loaded')
        }
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        const stack = err instanceof Error ? err.stack : undefined
        debugLog.error('Exception during project load', {
          error: message,
          stack,
        })
        setBriefingError(message)
        setView('loaded')
      }
    }

    loadBriefing()

    return () => {
      cancelled = true
    }
  }, [view, selectedProject?.path, projectConfig])

  // Handle action selection from briefing menu
  const handleActionSelect = useCallback(
    (action: LoadProjectAction) => {
      debugLog.info('Action selected from briefing menu', {
        actionId: action.id,
        actionType: action.actionType,
        actionLabel: action.label,
      })

      if (action.actionType === 'continue_planning') {
        // TODO: Transition to ConversationPhase with existing project context
        // For now, show loaded state with a message
        debugLog.info('Continue planning selected - transitioning to loaded state')
        setView('loaded')
      } else if (action.actionType === 'open_obsidian') {
        debugLog.info('Open in Obsidian selected')
        setView('loaded')
      } else {
        // Other actions are stubs for now
        debugLog.info('Action not yet implemented', { actionType: action.actionType })
        setView('loaded')
      }
    },
    [],
  )

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
          setView('detail')
        }
        if (lower === 'b' && onBack) {
          onBack()
        }
        if (lower === 'q') {
          exit()
        }
      } else if (view === 'detail') {
        if (key.escape || lower === 'b') {
          setView('list')
          return
        }
        if (key.return) {
          // Start loading the AI briefing
          setBriefing(null)
          setBriefingError(null)
          setView('loading_briefing')
        }
      } else if (view === 'loading_briefing') {
        // Allow cancellation with Escape
        if (key.escape || lower === 'b') {
          setView('detail')
        }
      } else if (view === 'briefing') {
        // Escape/B goes back to list
        if (key.escape || lower === 'b') {
          setView('list')
          return
        }
        // Action selection is handled by BriefingActionMenu
      } else if (view === 'loaded') {
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
    },
    { isActive: !loading && view !== 'loading_briefing' },
  )

  const statusConfig =
    view === 'detail' || view === 'loaded' || view === 'briefing' || view === 'loading_briefing'
      ? projectConfig
      : config
  const overrideEntries = Object.entries(projectSettings.overrides)

  // Determine if we should show project name in status bar
  const showProjectInStatusBar =
    view === 'loading_briefing' ||
    view === 'briefing' ||
    view === 'loaded'
  const statusBarProjectName = showProjectInStatusBar
    ? selectedProject?.name
    : undefined

  const renderWithStatusBar = (content: React.ReactNode) => (
    <Box flexDirection="column" height="100%" width="100%">
      <StatusBar
        config={statusConfig}
        showSettingsHint={false}
        projectName={statusBarProjectName}
      />
      <Box flexDirection="column" flexGrow={1} minHeight={0}>
        {content}
      </Box>
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

  if (view === 'loading_briefing' && selectedProject) {
    const steps: LoadingStep[] = [
      'scanning',
      'analyzing',
      'sending',
      'waiting',
      'processing',
    ]
    const currentStepIndex = steps.indexOf(loadingStep)

    return (
      renderWithStatusBar(
        <Box padding={1} flexDirection="column">
          <Text color="cyan" bold>
            Opening project dossier...
          </Text>
          <Text>{'\n'}</Text>

          {/* Progress steps */}
          <Box flexDirection="column" marginLeft={1}>
            {steps.map((step, idx) => {
              const isComplete = idx < currentStepIndex
              const isCurrent = idx === currentStepIndex
              const isPending = idx > currentStepIndex

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

  if (view === 'briefing' && selectedProject && briefing) {
    return (
      renderWithStatusBar(
        <Box padding={1} flexDirection="column" flexGrow={1}>
          <ProjectBriefingCard briefing={briefing} />
          <BriefingActionMenu
            actions={briefing.suggestedActions}
            onSelect={handleActionSelect}
          />
          <Box marginTop={1}>
            <Text dimColor>Press Esc/B to go back to project list.</Text>
          </Box>
        </Box>,
      )
    )
  }

  if (view === 'detail' && selectedProject) {
    return (
      renderWithStatusBar(
        <Box padding={1} flexDirection="column" flexGrow={1}>
          <Text color="cyan" bold>
            {selectedProject.name}
          </Text>
          <Text dimColor>{selectedProject.path}</Text>
          {selectedProject.updatedAt && (
            <Text dimColor>
              Last updated:{' '}
              {new Date(selectedProject.updatedAt).toLocaleString()}
            </Text>
          )}

          <Text>{'\n'}</Text>
          {selectedProject.overview ? (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold>Overview preview</Text>
              <Box marginLeft={2} flexDirection="column">
                {selectedProject.overview.split('\n').map((line, idx) => (
                  <Text key={idx}>{line}</Text>
                ))}
              </Box>
            </Box>
          ) : (
            <Text dimColor>No Overview.md found in this project.</Text>
          )}

          <Text>{'\n'}</Text>
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>Settings</Text>
            <Box marginLeft={2} flexDirection="column">
              {projectSettings.error ? (
                <Text color="red">
                  {projectSettings.error}
                  {projectSettings.settingsPath ? ` (${projectSettings.settingsPath})` : ''}
                </Text>
              ) : projectSettings.found ? (
                overrideEntries.length > 0 ? (
                  overrideEntries.map(([key, value]) => (
                    <Text key={key}>
                      {key}: {String(value)}
                    </Text>
                  ))
                ) : (
                  <Text dimColor>Settings.json found; no recognized overrides.</Text>
                )
              ) : (
                <Text dimColor>No Settings.json found; using global settings.</Text>
              )}
              {projectSettings.warnings.map((warning, idx) => (
                <Text key={`settings-warning-${idx}`} color="yellow">
                  {warning}
                </Text>
              ))}
            </Box>
          </Box>

          <Text>{'\n'}</Text>
          <Text dimColor>
            Press Enter to load, Esc/B to go back, or Q to quit.
          </Text>
        </Box>,
      )
    )
  }

  if (view === 'loaded' && selectedProject) {
    return (
      renderWithStatusBar(
        <Box padding={1} flexDirection="column">
          <Text color="green" bold>
            Project loaded
          </Text>
          <Text>{selectedProject.name}</Text>
          <Text color="cyan">{selectedProject.path}</Text>
          {briefingError && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="yellow">
                Note: Could not generate AI briefing. {briefingError}
              </Text>
            </Box>
          )}
          {overrideEntries.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Applied overrides</Text>
              <Box marginLeft={2} flexDirection="column">
                {overrideEntries.map(([key, value]) => (
                  <Text key={key}>
                    {key}: {String(value)}
                  </Text>
                ))}
              </Box>
            </Box>
          )}
          <Text>{'\n'}</Text>
          <Text dimColor>
            Open this folder in Obsidian to keep working. Press Enter to exit.
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

