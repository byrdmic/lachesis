import React, { useCallback, useEffect, useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type { LachesisConfig } from '../../config/types.ts'
import { loadProjectSettings, saveProjectSettings } from '../../config/project-settings.ts'
import { updateConfig } from '../../config/config.ts'
import { StatusBar, SettingsPanel } from '../components/index.ts'
import type { AIStatusDescriptor } from '../components/StatusBar.tsx'
import { buildProjectSnapshot } from '../../core/project/snapshot-builder.ts'
import { formatProjectSnapshotForModel } from '../../ai/prompts.ts'
import {
  getConversationState,
  saveConversationState,
  clearConversationState,
  setActiveExistingProject,
  clearActiveExistingProject,
} from '../../core/conversation-store.ts'
import type { ExtractedProjectData, ConversationMessage } from '../../ai/client.ts'
import { ConversationPhase, type StoredConversationState } from '../NewProject/ConversationPhase.tsx'
import { debugLog } from '../../debug/logger.ts'
import { assertNever } from '../../utils/type-guards.ts'

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
  config: initialConfig,
  debug = false,
  onBack,
  onDebugHotkeysChange,
}: ExistingProjectFlowProps) {
  const { exit } = useApp()
  const [config, setConfig] = useState<LachesisConfig>(initialConfig)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [view, setView] = useState<ViewState>('list')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [projectConfig, setProjectConfig] = useState<LachesisConfig>(config)
  const [showSettings, setShowSettings] = useState(false)
  const [projectOverrides, setProjectOverrides] = useState<Partial<LachesisConfig>>({})

  // Track the actually loaded project (not just selected in list)
  const [loadedProject, setLoadedProject] = useState<ProjectSummary | null>(null)

  // AI status for status bar
  const [aiStatus, setAIStatus] = useState<AIStatusDescriptor>({
    state: 'idle',
    message: 'Ready',
  })
  const [inputLocked, setInputLocked] = useState(false)

  // Context loading state
  const [serializedContext, setSerializedContext] = useState<string | null>(null)

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

  // Load project settings when a project is loaded
  useEffect(() => {
    if (loadedProject) {
      const result = loadProjectSettings(config, loadedProject.path)
      setProjectConfig(result.config)
      setProjectOverrides(result.overrides)
      return
    }

    setProjectConfig(config)
    setProjectOverrides({})
  }, [config, loadedProject?.path])

  // Effect to build project snapshot when entering loading_context
  useEffect(() => {
    if (view !== 'loading_context' || !loadedProject) return

    const project = loadedProject
    let cancelled = false

    async function loadContext() {
      try {
        debugLog.info('Starting project snapshot build', {
          projectName: project.name,
          projectPath: project.path,
        })

        setAIStatus({ state: 'processing', message: 'Building project snapshot...' })

        const snapshot = await buildProjectSnapshot(project.path)
        debugLog.info('snapshot', { ...snapshot })
        if (cancelled) return

        const serialized = formatProjectSnapshotForModel(snapshot)
        debugLog.debug('Snapshot serialized for AI', {
          length: serialized.length,
          preview: serialized.slice(0, 300),
        })

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
  }, [view, loadedProject?.path, projectConfig])

  // Effect to set active existing project when entering conversation
  useEffect(() => {
    if (view === 'conversation' && loadedProject) {
      setActiveExistingProject({
        name: loadedProject.name,
        path: loadedProject.path,
      })
    }
  }, [view, loadedProject?.name, loadedProject?.path])

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
      // Clear stored conversation state on completion
      if (loadedProject) {
        clearConversationState(loadedProject.path)
      }
      // Clear active existing project since conversation is complete
      clearActiveExistingProject()
      // TODO: Could update project files with new insights here
      setView('complete')
    },
    [loadedProject],
  )

  // Handle cancellation from conversation
  const handleCancel = useCallback(() => {
    setLoadedProject(null)
    if (onBack) {
      onBack()
      return
    }
    setView('list')
  }, [onBack])

  // Handle global settings save
  const handleSettingsSave = useCallback(
    (updates: Partial<LachesisConfig>) => {
      const newConfig = { ...config, ...updates }
      setConfig(newConfig)
      updateConfig(updates)
      // Reload project config to merge with new global settings
      if (loadedProject) {
        const result = loadProjectSettings(newConfig, loadedProject.path)
        setProjectConfig(result.config)
      }
    },
    [config, loadedProject],
  )

  // Handle project settings save
  const handleProjectSettingsSave = useCallback(
    (updates: Partial<LachesisConfig>) => {
      if (!loadedProject) return

      const result = saveProjectSettings(loadedProject.path, updates)
      if (result.success) {
        setProjectOverrides(updates)
        // Reload merged config
        const loadResult = loadProjectSettings(config, loadedProject.path)
        setProjectConfig(loadResult.config)
      }
    },
    [config, loadedProject],
  )

  useInput(
    (input, key) => {
      const lower = input.toLowerCase()

      // Handle settings hotkey - only when a project is actually loaded
      if (lower === 's' && !showSettings && loadedProject) {
        setShowSettings(true)
        return
      }

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
        if (key.return && projects.length > 0 && selectedProject) {
          // Load the selected project
          setLoadedProject(selectedProject)
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
        // Allow cancellation with Escape - clear loaded project
        if (key.escape || lower === 'b') {
          setLoadedProject(null)
          setView('list')
        }
      } else if (view === 'complete') {
        if (lower === 'b') {
          // Going back to list clears loaded project
          setLoadedProject(null)
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
    { isActive: !inputLocked && view !== 'conversation' && !showSettings },
  )

  const statusConfig = loadedProject ? projectConfig : config

  // Determine if we should show project name in status bar
  const statusBarProjectName = loadedProject?.name

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

  // Overlay: Settings panel (early return before switch)
  if (showSettings) {
    return (
      <SettingsPanel
        config={config}
        projectSettings={
          loadedProject
            ? {
                projectName: loadedProject.name,
                projectPath: loadedProject.path,
                settingsPath: join(loadedProject.path, 'Settings.json'),
                found: Object.keys(projectOverrides).length > 0,
                overrides: projectOverrides,
              }
            : undefined
        }
        onSave={handleSettingsSave}
        onSaveProject={loadedProject ? handleProjectSettingsSave : undefined}
        onClose={() => setShowSettings(false)}
      />
    )
  }

  // Initial loading state (early return before view switch)
  if (loading) {
    return renderWithStatusBar(
      <Box padding={1}>
        <Text color="cyan">Scanning your vault for projects...</Text>
      </Box>,
    )
  }

  // View renderer with switch for exhaustive handling
  const renderViewStep = (): React.ReactNode => {
    switch (view) {
      case 'empty': {
        const vaultLabel = config.vaultPath || 'your configured vault'
        return (
          <Box padding={1} flexDirection="column">
            <Text bold>No projects found in {vaultLabel}</Text>
            {error && <Text color="red">{error}</Text>}
            <Text>{'\n'}</Text>
            <Text dimColor>
              Create a project first, or press [B] to go back / [Q] to quit.
            </Text>
          </Box>
        )
      }

      case 'loading_context': {
        if (!loadedProject) return null

        return (
          <Box padding={1} flexDirection="column">
            <Text color="cyan" bold>
              Loading project context...
            </Text>
            <Text>{'\n'}</Text>

            <Box flexDirection="column" marginLeft={1}>
              <Box>
                <Text color="cyan">
                  {'●'} Building project snapshot...
                </Text>
              </Box>
            </Box>

            <Text>{'\n'}</Text>
            <Text dimColor>Press Esc to cancel.</Text>
          </Box>
        )
      }

      case 'conversation': {
        if (!loadedProject || !serializedContext) return null
        const storedState = getConversationState(loadedProject.path)

        return (
          <ConversationPhase
            config={projectConfig}
            planningLevel="Existing project"
            projectName={loadedProject.name}
            oneLiner={loadedProject.overview?.split('\n')[0] || 'Existing project'}
            debug={debug}
            sessionKind="existing"
            projectContext={serializedContext}
            initialState={storedState ?? undefined}
            agenticEnabled={true}
            projectPath={loadedProject.path}
            onInputModeChange={setInputLocked}
            onAIStatusChange={setAIStatus}
            onDebugHotkeysChange={notifyDebugHotkeys}
            onShowSettings={() => setShowSettings(true)}
            onStateChange={(state: StoredConversationState) => {
              saveConversationState(loadedProject.path, state)
            }}
            onClearConversation={() => {
              clearConversationState(loadedProject.path)
              clearActiveExistingProject()
            }}
            onComplete={handleConversationComplete}
            onCancel={handleCancel}
          />
        )
      }

      case 'complete': {
        if (!loadedProject) return null
        return (
          <Box padding={1} flexDirection="column">
            <Text color="green" bold>
              Session complete
            </Text>
            <Text>{loadedProject.name}</Text>
            <Text color="cyan">{loadedProject.path}</Text>
            <Text>{'\n'}</Text>
            <Text dimColor>
              Press [S] settings, [B] to go back to project list, or [Q] to quit.
            </Text>
          </Box>
        )
      }

      case 'list':
        return (
          <Box padding={1} flexDirection="column" flexGrow={1}>
            <Text bold>Select an existing project</Text>
            <Text dimColor>
              Use up/down to navigate, Enter to load, [B] back, [Q] quit.
            </Text>
            <Text dimColor>
              Vault: {config.vaultPath || 'Not set - update in settings'}
            </Text>
            <Text>{'\n'}</Text>

            {formattedProjects.map((project, idx) => {
              const isSelected = idx === selectedIndex
              const prefix = isSelected ? '> ' : '  '
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
          </Box>
        )

      default:
        return assertNever(view)
    }
  }

  return renderWithStatusBar(renderViewStep())
}

function buildOverviewPreview(content: string): string {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '')
  return lines.slice(0, 5).join('\n')
}
