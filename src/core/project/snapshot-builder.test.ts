import { describe, it, expect, mock } from 'bun:test'
import { buildProjectSnapshotViaMCP } from './snapshot-builder.ts'
import { EXPECTED_CORE_FILES, type ExpectedCoreFile } from './snapshot.ts'
import type { Tool } from 'ai'

// ============================================================================
// Mock Tool Factory
// ============================================================================

type MockToolResponses = {
  listFilesInDir?: (args: { dirpath: string }) => unknown
  listFilesInVault?: () => unknown
  getFileContents?: (args: { filepath: string }) => unknown
}

function createMockTools(responses: MockToolResponses): Record<string, Tool> {
  const tools: Record<string, Tool> = {}

  if (responses.listFilesInDir) {
    tools['obsidian_list_files_in_dir'] = {
      execute: responses.listFilesInDir,
    } as unknown as Tool
  }

  if (responses.listFilesInVault) {
    tools['obsidian_list_files_in_vault'] = {
      execute: responses.listFilesInVault,
    } as unknown as Tool
  }

  if (responses.getFileContents) {
    tools['obsidian_get_file_contents'] = {
      execute: responses.getFileContents,
    } as unknown as Tool
  }

  return tools
}

// Helper to create MCP response format
function mcpResponse(text: string, isError = false) {
  return {
    content: [{ type: 'text', text }],
    isError,
  }
}

// Helper to create file list response
function fileListResponse(files: string[]) {
  return mcpResponse(JSON.stringify(files))
}

// Helper to create file content response
function fileContentResponse(content: string) {
  return mcpResponse(content)
}

// Helper to create realistic Overview.md content
function createOverviewContent(options: {
  title?: string
  status?: string
  github?: string
  body?: string
} = {}) {
  const frontmatter = [
    '---',
    `title: ${options.title ?? 'Test Project'}`,
    `status: ${options.status ?? 'active'}`,
  ]
  if (options.github) {
    frontmatter.push(`github: ${options.github}`)
  }
  frontmatter.push('---')

  const body = options.body ?? `# ${options.title ?? 'Test Project'}

A test project for unit testing the snapshot builder.

## Problem

Testing is important for code quality.

## Solution

Write comprehensive tests.

## Success Criteria

- All tests pass
- Code coverage is good
`

  return frontmatter.join('\n') + '\n' + body
}

// Helper to create minimal file content that passes as "filled"
function createFilledContent(file: ExpectedCoreFile): string {
  const frontmatter = `---
title: ${file.replace('.md', '')}
---
`
  // Create enough content to pass the minimum threshold
  const padding = 'x'.repeat(250) // More than max minMeaningful (200)
  return frontmatter + padding
}

// Helper to create template-only content
function createTemplateContent(file: ExpectedCoreFile): string {
  return `---
title: ${file.replace('.md', '')}
---
# <Project Name>

<Placeholder content that should be filled in>
<Another placeholder>
<Yet another>
<And more>
<Even more>
<Still more>
`
}

// ============================================================================
// Tests
// ============================================================================

describe('buildProjectSnapshotViaMCP', () => {
  describe('basic snapshot structure', () => {
    it('returns a valid ProjectSnapshot with all expected fields', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md', 'Roadmap.md', 'Log.md']),
        getFileContents: () => fileContentResponse(createFilledContent('Overview.md')),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot).toHaveProperty('projectName')
      expect(snapshot).toHaveProperty('projectPath')
      expect(snapshot).toHaveProperty('capturedAt')
      expect(snapshot).toHaveProperty('expectedFiles')
      expect(snapshot).toHaveProperty('files')
      expect(snapshot).toHaveProperty('githubRepos')
      expect(snapshot).toHaveProperty('health')
    })

    it('extracts project name from path', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse([]),
        getFileContents: () => fileContentResponse(''),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/MyAwesomeProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.projectName).toBe('MyAwesomeProject')
    })

    it('includes all expected core files in expectedFiles', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse([]),
        getFileContents: () => fileContentResponse(''),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.expectedFiles).toEqual(EXPECTED_CORE_FILES)
    })

    it('sets capturedAt to ISO timestamp', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse([]),
        getFileContents: () => fileContentResponse(''),
      })

      const before = new Date().toISOString()
      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )
      const after = new Date().toISOString()

      expect(snapshot.capturedAt >= before).toBe(true)
      expect(snapshot.capturedAt <= after).toBe(true)
    })
  })

  describe('file discovery', () => {
    it('uses obsidian_list_files_in_dir when available', async () => {
      const listFilesInDirFn = mock(() =>
        fileListResponse(['Overview.md', 'Roadmap.md', 'Log.md']),
      )

      const tools = createMockTools({
        listFilesInDir: listFilesInDirFn,
        getFileContents: () => fileContentResponse(createFilledContent('Overview.md')),
      })

      await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(listFilesInDirFn).toHaveBeenCalled()
    })

    it('marks found files as existing', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md', 'Roadmap.md']),
        getFileContents: () => fileContentResponse(createFilledContent('Overview.md')),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.files['Overview.md'].exists).toBe(true)
      expect(snapshot.files['Roadmap.md'].exists).toBe(true)
    })

    it('marks missing files as not existing', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () => fileContentResponse(createFilledContent('Overview.md')),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.files['Tasks.md'].exists).toBe(false)
      expect(snapshot.files['Archive.md'].exists).toBe(false)
    })

    it('handles empty file list', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse([]),
        getFileContents: () => fileContentResponse(''),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      // All files should be marked as missing
      for (const file of EXPECTED_CORE_FILES) {
        expect(snapshot.files[file].exists).toBe(false)
        expect(snapshot.files[file].templateStatus).toBe('missing')
      }
    })

    it('falls back to list_files_in_vault when list_files_in_dir unavailable', async () => {
      const listFilesInVaultFn = mock(() => [
        'Projects/TestProject/Overview.md',
        'Projects/TestProject/Roadmap.md',
        'Projects/OtherProject/Overview.md', // Should be filtered out
      ])

      const tools = createMockTools({
        listFilesInVault: listFilesInVaultFn,
        getFileContents: () => fileContentResponse(createFilledContent('Overview.md')),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(listFilesInVaultFn).toHaveBeenCalled()
    })
  })

  describe('MCP response parsing', () => {
    it('handles new MCP format with content array', async () => {
      const tools = createMockTools({
        listFilesInDir: () => ({
          content: [{ type: 'text', text: '["Overview.md", "Log.md"]' }],
          isError: false,
        }),
        getFileContents: () => ({
          content: [{ type: 'text', text: createFilledContent('Overview.md') }],
          isError: false,
        }),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.files['Overview.md'].exists).toBe(true)
      expect(snapshot.files['Log.md'].exists).toBe(true)
    })

    it('handles legacy array response format', async () => {
      const tools = createMockTools({
        listFilesInDir: () => ['Overview.md', 'Roadmap.md'],
        getFileContents: () => createFilledContent('Overview.md'),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.files['Overview.md'].exists).toBe(true)
      expect(snapshot.files['Roadmap.md'].exists).toBe(true)
    })

    it('handles legacy { content: string } response format', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () => ({ content: createFilledContent('Overview.md') }),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.files['Overview.md'].exists).toBe(true)
      expect(snapshot.files['Overview.md'].templateStatus).toBe('filled')
    })

    it('handles MCP error responses gracefully', async () => {
      const tools = createMockTools({
        listFilesInDir: () => ({
          content: [{ type: 'text', text: 'Error: Permission denied' }],
          isError: true,
        }),
        getFileContents: () => fileContentResponse(''),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      // Should handle gracefully without throwing
      expect(snapshot.projectName).toBe('TestProject')
    })
  })

  describe('path normalization', () => {
    it('handles Windows backslash paths', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () => fileContentResponse(createFilledContent('Overview.md')),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        'G:\\My Drive\\Nexus\\Projects\\TestProject',
        'G:\\My Drive\\Nexus\\Projects',
        tools,
      )

      expect(snapshot.projectName).toBe('TestProject')
    })

    it('strips trailing slashes from paths', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () => fileContentResponse(createFilledContent('Overview.md')),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject/',
        '/vault/Projects/',
        tools,
      )

      expect(snapshot.projectName).toBe('TestProject')
    })

    it('handles mixed path separators', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () => fileContentResponse(createFilledContent('Overview.md')),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        'G:/My Drive\\Nexus/Projects\\TestProject',
        'G:/My Drive\\Nexus/Projects',
        tools,
      )

      expect(snapshot.projectName).toBe('TestProject')
    })
  })

  describe('frontmatter extraction', () => {
    it('extracts frontmatter from Overview.md', async () => {
      const content = `---
title: My Project
status: active
priority: high
---
# Content`

      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () => fileContentResponse(content),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.files['Overview.md'].frontmatter).toEqual({
        title: 'My Project',
        status: 'active',
        priority: 'high',
      })
    })

    it('handles missing frontmatter', async () => {
      const content = '# No Frontmatter\n\nJust content here.'

      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () => fileContentResponse(content),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.files['Overview.md'].frontmatter).toEqual({})
    })

    it('handles invalid YAML frontmatter', async () => {
      const content = `---
invalid: yaml: content: here
---
# Content`

      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () => fileContentResponse(content),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      // Should not crash, return empty frontmatter
      expect(snapshot.files['Overview.md'].frontmatter).toEqual({})
    })
  })

  describe('GitHub repos extraction', () => {
    it('extracts single GitHub repo from frontmatter', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () =>
          fileContentResponse(createOverviewContent({ github: 'user/repo' })),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.githubRepos).toEqual(['user/repo'])
    })

    it('extracts multiple GitHub repos (comma-separated)', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () =>
          fileContentResponse(createOverviewContent({ github: 'user/repo1, user/repo2, org/repo3' })),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.githubRepos).toEqual(['user/repo1', 'user/repo2', 'org/repo3'])
    })

    it('returns empty array when no GitHub field', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () => fileContentResponse(createOverviewContent({})),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.githubRepos).toEqual([])
    })

    it('handles "N/A" github field', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () =>
          fileContentResponse(createOverviewContent({ github: 'N/A' })),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.githubRepos).toEqual([])
    })

    it('handles "n/a" github field (case insensitive)', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () =>
          fileContentResponse(createOverviewContent({ github: 'n/a' })),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.githubRepos).toEqual([])
    })
  })

  describe('health assessment', () => {
    it('reports missing files in health.missingFiles', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md', 'Log.md']),
        getFileContents: () => fileContentResponse(createFilledContent('Overview.md')),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.health.missingFiles).toContain('Roadmap.md')
      expect(snapshot.health.missingFiles).toContain('Tasks.md')
      expect(snapshot.health.missingFiles).toContain('Archive.md')
      expect(snapshot.health.missingFiles).toContain('Ideas.md')
      expect(snapshot.health.missingFiles).not.toContain('Overview.md')
      expect(snapshot.health.missingFiles).not.toContain('Log.md')
    })

    it('reports template_only files in health.thinOrTemplateFiles', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () => fileContentResponse(createTemplateContent('Overview.md')),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      const templateFiles = snapshot.health.thinOrTemplateFiles
      const overviewEntry = templateFiles.find((f) => f.file === 'Overview.md')
      expect(overviewEntry).toBeDefined()
      expect(overviewEntry?.status).toBe('template_only')
    })

    it('reports thin files in health.thinOrTemplateFiles', async () => {
      const thinContent = `---
title: Overview
---
# My Project

Short description.
`
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () => fileContentResponse(thinContent),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      const templateFiles = snapshot.health.thinOrTemplateFiles
      const overviewEntry = templateFiles.find((f) => f.file === 'Overview.md')
      expect(overviewEntry).toBeDefined()
      expect(overviewEntry?.status).toBe('thin')
    })

    it('does not include filled files in health.thinOrTemplateFiles', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md', 'Log.md']),
        getFileContents: (args: { filepath: string }) => {
          if (args.filepath.includes('Overview')) {
            return fileContentResponse(createFilledContent('Overview.md'))
          }
          return fileContentResponse(createFilledContent('Log.md'))
        },
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      const filledFileNames = snapshot.health.thinOrTemplateFiles.map((f) => f.file)
      expect(filledFileNames).not.toContain('Overview.md')
      expect(filledFileNames).not.toContain('Log.md')
    })

    it('includes reasons for thin/template status', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () => fileContentResponse(createTemplateContent('Overview.md')),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      const templateFiles = snapshot.health.thinOrTemplateFiles
      const overviewEntry = templateFiles.find((f) => f.file === 'Overview.md')
      expect(overviewEntry?.reasons.length).toBeGreaterThan(0)
    })
  })

  describe('template status evaluation', () => {
    it('marks files with empty content as not existing', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () => fileContentResponse(''),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      // File found in listing but content is empty string (falsy)
      // The code treats empty content the same as no content: exists: false
      expect(snapshot.files['Overview.md'].exists).toBe(false)
      expect(snapshot.files['Overview.md'].templateStatus).toBe('missing')
    })

    it('evaluates each file with correct template rules', async () => {
      // Create different content for different files
      const fileContents: Record<string, string> = {
        Overview: createFilledContent('Overview.md'),
        Roadmap: createTemplateContent('Roadmap.md'),
        Log: createFilledContent('Log.md'),
        Tasks: createFilledContent('Tasks.md'),
        Ideas: createTemplateContent('Ideas.md'),
        Archive: createFilledContent('Archive.md'),
      }

      const tools = createMockTools({
        listFilesInDir: () =>
          fileListResponse([
            'Overview.md',
            'Roadmap.md',
            'Log.md',
            'Tasks.md',
            'Ideas.md',
            'Archive.md',
          ]),
        getFileContents: (args: { filepath: string }) => {
          for (const [name, content] of Object.entries(fileContents)) {
            if (args.filepath.includes(name)) {
              return fileContentResponse(content)
            }
          }
          return fileContentResponse('')
        },
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.files['Overview.md'].templateStatus).toBe('filled')
      expect(snapshot.files['Roadmap.md'].templateStatus).toBe('template_only')
      expect(snapshot.files['Log.md'].templateStatus).toBe('filled')
    })
  })

  describe('error handling', () => {
    it('handles tool execution errors gracefully', async () => {
      const tools = createMockTools({
        listFilesInDir: () => {
          throw new Error('Network error')
        },
        listFilesInVault: () => {
          throw new Error('Also failed')
        },
        getFileContents: () => fileContentResponse(''),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      // Should return a valid snapshot even if file listing fails
      expect(snapshot.projectName).toBe('TestProject')
      // All files will be marked as missing
      for (const file of EXPECTED_CORE_FILES) {
        expect(snapshot.files[file].exists).toBe(false)
      }
    })

    it('handles missing tools gracefully', async () => {
      // No tools at all
      const tools: Record<string, Tool> = {}

      // Without file listing tools, the function still returns a snapshot
      // but all files will be marked as missing (no way to discover them)
      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.projectName).toBe('TestProject')
      // All files should be missing since no tools to list them
      for (const file of EXPECTED_CORE_FILES) {
        expect(snapshot.files[file].exists).toBe(false)
      }
    })

    it('handles file read errors for individual files', async () => {
      let callCount = 0
      const tools = createMockTools({
        listFilesInDir: () =>
          fileListResponse(['Overview.md', 'Log.md']),
        getFileContents: (args: { filepath: string }) => {
          callCount++
          // First call (Overview.md) throws, second call (Log.md) succeeds
          if (args.filepath.includes('Overview')) {
            throw new Error('File read error')
          }
          return fileContentResponse(createFilledContent('Log.md'))
        },
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      // Should complete without crashing
      // Overview.md read failed, so it exists but has no content (treated as not fully existing)
      // The code marks files without readable content as not existing
      expect(snapshot.files['Overview.md'].exists).toBe(false)
      // Log.md should succeed
      expect(snapshot.files['Log.md'].exists).toBe(true)
    })
  })

  describe('file entry structure', () => {
    it('includes correct path in file entries', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () => fileContentResponse(createFilledContent('Overview.md')),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.files['Overview.md'].path).toBe(
        '/vault/Projects/TestProject/Overview.md',
      )
    })

    it('includes templateFindings for each file', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse(['Overview.md']),
        getFileContents: () => fileContentResponse(createFilledContent('Overview.md')),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.files['Overview.md'].templateFindings).toBeDefined()
      expect(Array.isArray(snapshot.files['Overview.md'].templateFindings)).toBe(true)
    })

    it('sets templateFindings for missing files', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse([]),
        getFileContents: () => fileContentResponse(''),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.files['Overview.md'].templateFindings).toContain('File missing')
    })
  })

  describe('complex scenarios', () => {
    it('handles a fully populated project', async () => {
      const files = EXPECTED_CORE_FILES

      const tools = createMockTools({
        listFilesInDir: () => fileListResponse([...files]),
        getFileContents: (args: { filepath: string }) => {
          const fileName = args.filepath.split('/').pop() as ExpectedCoreFile
          return fileContentResponse(createFilledContent(fileName))
        },
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/TestProject',
        '/vault/Projects',
        tools,
      )

      // All files should exist and be filled
      for (const file of files) {
        expect(snapshot.files[file].exists).toBe(true)
        expect(snapshot.files[file].templateStatus).toBe('filled')
      }

      // Health should be clean
      expect(snapshot.health.missingFiles).toEqual([])
      expect(snapshot.health.thinOrTemplateFiles).toEqual([])
    })

    it('handles a completely empty project', async () => {
      const tools = createMockTools({
        listFilesInDir: () => fileListResponse([]),
        getFileContents: () => fileContentResponse(''),
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/EmptyProject',
        '/vault/Projects',
        tools,
      )

      // All files should be missing
      expect(snapshot.health.missingFiles).toEqual(EXPECTED_CORE_FILES)
      expect(snapshot.health.thinOrTemplateFiles).toEqual([])
    })

    it('handles mixed file states', async () => {
      const tools = createMockTools({
        listFilesInDir: () =>
          fileListResponse(['Overview.md', 'Roadmap.md', 'Log.md']),
        getFileContents: (args: { filepath: string }) => {
          if (args.filepath.includes('Overview')) {
            return fileContentResponse(createFilledContent('Overview.md'))
          }
          if (args.filepath.includes('Roadmap')) {
            return fileContentResponse(createTemplateContent('Roadmap.md'))
          }
          if (args.filepath.includes('Log')) {
            // Thin content
            return fileContentResponse(`---
title: Log
---
# Log

Started.
`)
          }
          return fileContentResponse('')
        },
      })

      const snapshot = await buildProjectSnapshotViaMCP(
        '/vault/Projects/MixedProject',
        '/vault/Projects',
        tools,
      )

      expect(snapshot.files['Overview.md'].templateStatus).toBe('filled')
      expect(snapshot.files['Roadmap.md'].templateStatus).toBe('template_only')
      expect(snapshot.files['Log.md'].templateStatus).toBe('thin')
      expect(snapshot.files['Tasks.md'].exists).toBe(false)

      expect(snapshot.health.missingFiles).toContain('Tasks.md')
      expect(snapshot.health.missingFiles).toContain('Ideas.md')
      expect(snapshot.health.missingFiles).toContain('Archive.md')

      const thinOrTemplate = snapshot.health.thinOrTemplateFiles.map((f) => f.file)
      expect(thinOrTemplate).toContain('Roadmap.md')
      expect(thinOrTemplate).toContain('Log.md')
    })
  })
})
