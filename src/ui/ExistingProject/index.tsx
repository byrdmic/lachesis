import React, { useCallback, useEffect, useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type { LachesisConfig } from '../../config/types.ts'
import { loadProjectSettings } from '../../config/project-settings.ts'
import { StatusBar } from '../components/index.ts'

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

export function ExistingProjectFlow({ config, onBack }: ExistingProjectFlowProps) {
  const { exit } = useApp()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [view, setView] = useState<'list' | 'detail' | 'loaded' | 'empty'>('list')
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
    if ((view === 'detail' || view === 'loaded') && selectedProject) {
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
          setView('loaded')
        }
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
    { isActive: !loading },
  )

  const statusConfig =
    view === 'detail' || view === 'loaded' ? projectConfig : config
  const overrideEntries = Object.entries(projectSettings.overrides)
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
      <Box flexDirection="column">
        <StatusBar config={statusConfig} showSettingsHint={false} />
        <Box padding={1}>
          <Text color="cyan">Scanning your vault for projects...</Text>
        </Box>
      </Box>
    )
  }

  if (view === 'empty') {
    const vaultLabel = config.vaultPath || 'your configured vault'
    return (
      <Box flexDirection="column">
        <StatusBar config={statusConfig} showSettingsHint={false} />
        <Box padding={1}>
          <Text bold>No projects found in {vaultLabel}</Text>
          {error && <Text color="red">{error}</Text>}
          <Text>{'\n'}</Text>
          <Text dimColor>
            Create a project first, or press [B] to go back / [Q] to quit.
          </Text>
        </Box>
      </Box>
    )
  }

  if (view === 'detail' && selectedProject) {
    return (
      <Box flexDirection="column">
        <StatusBar config={statusConfig} showSettingsHint={false} />
        <Box padding={1} flexDirection="column">
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
        </Box>
      </Box>
    )
  }

  if (view === 'loaded' && selectedProject) {
    return (
      <Box flexDirection="column">
        <StatusBar config={statusConfig} showSettingsHint={false} />
        <Box padding={1} flexDirection="column">
          <Text color="green" bold>
            Project loaded
          </Text>
          <Text>{selectedProject.name}</Text>
          <Text color="cyan">{selectedProject.path}</Text>
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
        </Box>
      </Box>
    )
  }

  // Default: list view
  return (
    <Box flexDirection="column">
      <StatusBar config={statusConfig} showSettingsHint={false} />
      <Box padding={1} flexDirection="column">
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
      </Box>
    </Box>
  )
}

function buildOverviewPreview(content: string): string {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '')
  return lines.slice(0, 5).join('\n')
}

