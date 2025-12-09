import React, { useCallback, useEffect, useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type { LachesisConfig } from '../../config/types.ts'
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

  useInput(
    (input, key) => {
      const lower = input.toLowerCase()

      if (view === 'list') {
        if (key.upArrow) {
          setSelectedIndex((idx) => Math.max(0, idx - 1))
        }
        if (key.downArrow) {
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

  const selectedProject = projects[selectedIndex] ?? null

  if (loading) {
    return (
      <Box flexDirection="column">
        <StatusBar config={config} />
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
        <StatusBar config={config} />
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
        <StatusBar config={config} />
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
          <Text dimColor>
            Press Enter to load, Esc/B to go back, or Q to quit.
          </Text>
        </Box>
      </Box>
    )
  }

  if (view === 'loaded' && selectedProject) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>
          Project loaded
        </Text>
        <Text>{selectedProject.name}</Text>
        <Text color="cyan">{selectedProject.path}</Text>
        <Text>{'\n'}</Text>
        <Text dimColor>
          Open this folder in Obsidian to keep working. Press Enter to exit.
        </Text>
      </Box>
    )
  }

  // Default: list view
  return (
    <Box flexDirection="column">
      <StatusBar config={config} />
      <Box padding={1} flexDirection="column">
        <Text bold>Select an existing project</Text>
        <Text dimColor>
          Use ↑/↓ to navigate, Enter to view, [B] back, [Q] quit.
        </Text>
        <Text>{'\n'}</Text>

        {projects.map((project, idx) => (
          <Box key={project.path} flexDirection="column" marginBottom={1}>
            <Text color={idx === selectedIndex ? 'cyan' : undefined}>
              {idx === selectedIndex ? '❯ ' : '  '}
              {project.name}
            </Text>
            {project.updatedAt && (
              <Text dimColor>
                {'  '}Updated {new Date(project.updatedAt).toLocaleString()}
              </Text>
            )}
            {project.overview && (
              <Text dimColor>{'  '}{project.overview.split('\n')[0]}</Text>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function buildOverviewPreview(content: string): string {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '')
  return lines.slice(0, 5).join('\n')
}

