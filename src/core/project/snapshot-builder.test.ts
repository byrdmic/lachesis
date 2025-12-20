import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildProjectSnapshot } from './snapshot-builder.ts'
import { EXPECTED_CORE_FILES, type ExpectedCoreFile } from './snapshot.ts'

// ============================================================================
// Test Helpers
// ============================================================================

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

describe('buildProjectSnapshot', () => {
  let tempDir: string
  let projectPath: string

  beforeEach(() => {
    // Create a unique temp directory for each test
    tempDir = join(tmpdir(), `lachesis-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    projectPath = join(tempDir, 'TestProject')
    mkdirSync(projectPath, { recursive: true })
  })

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('basic snapshot structure', () => {
    it('returns a valid ProjectSnapshot with all expected fields', async () => {
      // Create some files
      writeFileSync(join(projectPath, 'Overview.md'), createFilledContent('Overview.md'))
      writeFileSync(join(projectPath, 'Roadmap.md'), createFilledContent('Roadmap.md'))
      writeFileSync(join(projectPath, 'Log.md'), createFilledContent('Log.md'))

      const snapshot = await buildProjectSnapshot(projectPath)

      expect(snapshot).toHaveProperty('projectName')
      expect(snapshot).toHaveProperty('projectPath')
      expect(snapshot).toHaveProperty('capturedAt')
      expect(snapshot).toHaveProperty('expectedFiles')
      expect(snapshot).toHaveProperty('files')
      expect(snapshot).toHaveProperty('githubRepos')
      expect(snapshot).toHaveProperty('health')
    })

    it('extracts project name from path', async () => {
      const snapshot = await buildProjectSnapshot(projectPath)
      expect(snapshot.projectName).toBe('TestProject')
    })

    it('includes all expected core files in expectedFiles', async () => {
      const snapshot = await buildProjectSnapshot(projectPath)
      expect(snapshot.expectedFiles).toEqual(EXPECTED_CORE_FILES)
    })

    it('sets capturedAt to ISO timestamp', async () => {
      const before = new Date().toISOString()
      const snapshot = await buildProjectSnapshot(projectPath)
      const after = new Date().toISOString()

      expect(snapshot.capturedAt >= before).toBe(true)
      expect(snapshot.capturedAt <= after).toBe(true)
    })
  })

  describe('file discovery', () => {
    it('marks found files as existing', async () => {
      writeFileSync(join(projectPath, 'Overview.md'), createFilledContent('Overview.md'))
      writeFileSync(join(projectPath, 'Roadmap.md'), createFilledContent('Roadmap.md'))

      const snapshot = await buildProjectSnapshot(projectPath)

      expect(snapshot.files['Overview.md'].exists).toBe(true)
      expect(snapshot.files['Roadmap.md'].exists).toBe(true)
    })

    it('marks missing files as not existing', async () => {
      writeFileSync(join(projectPath, 'Overview.md'), createFilledContent('Overview.md'))

      const snapshot = await buildProjectSnapshot(projectPath)

      expect(snapshot.files['Tasks.md'].exists).toBe(false)
      expect(snapshot.files['Archive.md'].exists).toBe(false)
    })

    it('handles empty project directory', async () => {
      const snapshot = await buildProjectSnapshot(projectPath)

      // All files should be marked as missing
      for (const file of EXPECTED_CORE_FILES) {
        expect(snapshot.files[file].exists).toBe(false)
        expect(snapshot.files[file].templateStatus).toBe('missing')
      }
    })
  })

  describe('path handling', () => {
    it('handles project path with trailing slash', async () => {
      writeFileSync(join(projectPath, 'Overview.md'), createFilledContent('Overview.md'))

      const snapshot = await buildProjectSnapshot(projectPath + '/')

      expect(snapshot.projectName).toBe('TestProject')
      expect(snapshot.files['Overview.md'].exists).toBe(true)
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

      writeFileSync(join(projectPath, 'Overview.md'), content)

      const snapshot = await buildProjectSnapshot(projectPath)

      expect(snapshot.files['Overview.md'].frontmatter).toEqual({
        title: 'My Project',
        status: 'active',
        priority: 'high',
      })
    })

    it('handles missing frontmatter', async () => {
      const content = '# No Frontmatter\n\nJust content here.'

      writeFileSync(join(projectPath, 'Overview.md'), content)

      const snapshot = await buildProjectSnapshot(projectPath)

      expect(snapshot.files['Overview.md'].frontmatter).toEqual({})
    })

    it('handles invalid YAML frontmatter', async () => {
      const content = `---
invalid: yaml: content: here
---
# Content`

      writeFileSync(join(projectPath, 'Overview.md'), content)

      const snapshot = await buildProjectSnapshot(projectPath)

      // Should not crash, return empty frontmatter
      expect(snapshot.files['Overview.md'].frontmatter).toEqual({})
    })
  })

  describe('GitHub repos extraction', () => {
    it('extracts single GitHub repo from frontmatter', async () => {
      writeFileSync(
        join(projectPath, 'Overview.md'),
        createOverviewContent({ github: 'user/repo' }),
      )

      const snapshot = await buildProjectSnapshot(projectPath)

      expect(snapshot.githubRepos).toEqual(['user/repo'])
    })

    it('extracts multiple GitHub repos (comma-separated)', async () => {
      writeFileSync(
        join(projectPath, 'Overview.md'),
        createOverviewContent({ github: 'user/repo1, user/repo2, org/repo3' }),
      )

      const snapshot = await buildProjectSnapshot(projectPath)

      expect(snapshot.githubRepos).toEqual(['user/repo1', 'user/repo2', 'org/repo3'])
    })

    it('returns empty array when no GitHub field', async () => {
      writeFileSync(join(projectPath, 'Overview.md'), createOverviewContent({}))

      const snapshot = await buildProjectSnapshot(projectPath)

      expect(snapshot.githubRepos).toEqual([])
    })

    it('handles "N/A" github field', async () => {
      writeFileSync(
        join(projectPath, 'Overview.md'),
        createOverviewContent({ github: 'N/A' }),
      )

      const snapshot = await buildProjectSnapshot(projectPath)

      expect(snapshot.githubRepos).toEqual([])
    })

    it('handles "n/a" github field (case insensitive)', async () => {
      writeFileSync(
        join(projectPath, 'Overview.md'),
        createOverviewContent({ github: 'n/a' }),
      )

      const snapshot = await buildProjectSnapshot(projectPath)

      expect(snapshot.githubRepos).toEqual([])
    })
  })

  describe('health assessment', () => {
    it('reports missing files in health.missingFiles', async () => {
      writeFileSync(join(projectPath, 'Overview.md'), createFilledContent('Overview.md'))
      writeFileSync(join(projectPath, 'Log.md'), createFilledContent('Log.md'))

      const snapshot = await buildProjectSnapshot(projectPath)

      expect(snapshot.health.missingFiles).toContain('Roadmap.md')
      expect(snapshot.health.missingFiles).toContain('Tasks.md')
      expect(snapshot.health.missingFiles).toContain('Archive.md')
      expect(snapshot.health.missingFiles).toContain('Ideas.md')
      expect(snapshot.health.missingFiles).not.toContain('Overview.md')
      expect(snapshot.health.missingFiles).not.toContain('Log.md')
    })

    it('reports template_only files in health.thinOrTemplateFiles', async () => {
      writeFileSync(join(projectPath, 'Overview.md'), createTemplateContent('Overview.md'))

      const snapshot = await buildProjectSnapshot(projectPath)

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
      writeFileSync(join(projectPath, 'Overview.md'), thinContent)

      const snapshot = await buildProjectSnapshot(projectPath)

      const templateFiles = snapshot.health.thinOrTemplateFiles
      const overviewEntry = templateFiles.find((f) => f.file === 'Overview.md')
      expect(overviewEntry).toBeDefined()
      expect(overviewEntry?.status).toBe('thin')
    })

    it('does not include filled files in health.thinOrTemplateFiles', async () => {
      writeFileSync(join(projectPath, 'Overview.md'), createFilledContent('Overview.md'))
      writeFileSync(join(projectPath, 'Log.md'), createFilledContent('Log.md'))

      const snapshot = await buildProjectSnapshot(projectPath)

      const filledFileNames = snapshot.health.thinOrTemplateFiles.map((f) => f.file)
      expect(filledFileNames).not.toContain('Overview.md')
      expect(filledFileNames).not.toContain('Log.md')
    })

    it('includes reasons for thin/template status', async () => {
      writeFileSync(join(projectPath, 'Overview.md'), createTemplateContent('Overview.md'))

      const snapshot = await buildProjectSnapshot(projectPath)

      const templateFiles = snapshot.health.thinOrTemplateFiles
      const overviewEntry = templateFiles.find((f) => f.file === 'Overview.md')
      expect(overviewEntry?.reasons.length).toBeGreaterThan(0)
    })
  })

  describe('template status evaluation', () => {
    it('marks files with empty content as not existing', async () => {
      writeFileSync(join(projectPath, 'Overview.md'), '')

      const snapshot = await buildProjectSnapshot(projectPath)

      // File exists on disk but content is empty (falsy)
      // The code treats empty content as not existing
      expect(snapshot.files['Overview.md'].exists).toBe(false)
      expect(snapshot.files['Overview.md'].templateStatus).toBe('missing')
    })

    it('evaluates each file with correct template rules', async () => {
      writeFileSync(join(projectPath, 'Overview.md'), createFilledContent('Overview.md'))
      writeFileSync(join(projectPath, 'Roadmap.md'), createTemplateContent('Roadmap.md'))
      writeFileSync(join(projectPath, 'Log.md'), createFilledContent('Log.md'))
      writeFileSync(join(projectPath, 'Tasks.md'), createFilledContent('Tasks.md'))
      writeFileSync(join(projectPath, 'Ideas.md'), createTemplateContent('Ideas.md'))
      writeFileSync(join(projectPath, 'Archive.md'), createFilledContent('Archive.md'))

      const snapshot = await buildProjectSnapshot(projectPath)

      expect(snapshot.files['Overview.md'].templateStatus).toBe('filled')
      expect(snapshot.files['Roadmap.md'].templateStatus).toBe('template_only')
      expect(snapshot.files['Log.md'].templateStatus).toBe('filled')
    })
  })

  describe('error handling', () => {
    it('handles non-existent project directory', async () => {
      const nonExistentPath = join(tempDir, 'non-existent-project')

      const snapshot = await buildProjectSnapshot(nonExistentPath)

      // Should return a valid snapshot with all files marked as missing
      expect(snapshot.projectName).toBe('non-existent-project')
      for (const file of EXPECTED_CORE_FILES) {
        expect(snapshot.files[file].exists).toBe(false)
      }
    })
  })

  describe('file entry structure', () => {
    it('includes correct path in file entries', async () => {
      writeFileSync(join(projectPath, 'Overview.md'), createFilledContent('Overview.md'))

      const snapshot = await buildProjectSnapshot(projectPath)

      expect(snapshot.files['Overview.md'].path).toBe(
        join(projectPath, 'Overview.md'),
      )
    })

    it('includes templateFindings for each file', async () => {
      writeFileSync(join(projectPath, 'Overview.md'), createFilledContent('Overview.md'))

      const snapshot = await buildProjectSnapshot(projectPath)

      expect(snapshot.files['Overview.md'].templateFindings).toBeDefined()
      expect(Array.isArray(snapshot.files['Overview.md'].templateFindings)).toBe(true)
    })

    it('sets templateFindings for missing files', async () => {
      const snapshot = await buildProjectSnapshot(projectPath)

      expect(snapshot.files['Overview.md'].templateFindings).toContain('File missing')
    })
  })

  describe('complex scenarios', () => {
    it('handles a fully populated project', async () => {
      for (const file of EXPECTED_CORE_FILES) {
        writeFileSync(join(projectPath, file), createFilledContent(file))
      }

      const snapshot = await buildProjectSnapshot(projectPath)

      // All files should exist and be filled
      for (const file of EXPECTED_CORE_FILES) {
        expect(snapshot.files[file].exists).toBe(true)
        expect(snapshot.files[file].templateStatus).toBe('filled')
      }

      // Health should be clean
      expect(snapshot.health.missingFiles).toEqual([])
      expect(snapshot.health.thinOrTemplateFiles).toEqual([])
    })

    it('handles a completely empty project', async () => {
      const snapshot = await buildProjectSnapshot(projectPath)

      // All files should be missing
      expect(snapshot.health.missingFiles).toEqual(EXPECTED_CORE_FILES)
      expect(snapshot.health.thinOrTemplateFiles).toEqual([])
    })

    it('handles mixed file states', async () => {
      writeFileSync(join(projectPath, 'Overview.md'), createFilledContent('Overview.md'))
      writeFileSync(join(projectPath, 'Roadmap.md'), createTemplateContent('Roadmap.md'))
      writeFileSync(join(projectPath, 'Log.md'), `---
title: Log
---
# Log

Started.
`)

      const snapshot = await buildProjectSnapshot(projectPath)

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
