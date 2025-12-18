import { describe, it, expect } from 'bun:test'
import { formatProjectSnapshotForModel, buildProjectQAPrompt, buildSystemPrompt } from './prompts.ts'
import type { ProjectSnapshot, SnapshotFileEntry, ExpectedCoreFile } from '../core/project/snapshot.ts'
import { EXPECTED_CORE_FILES } from '../core/project/snapshot.ts'

// ============================================================================
// Helper functions
// ============================================================================

function createMockFileEntry(
  file: ExpectedCoreFile,
  overrides: Partial<SnapshotFileEntry> = {},
): SnapshotFileEntry {
  return {
    path: `/vault/Projects/TestProject/${file}`,
    exists: true,
    frontmatter: {},
    templateStatus: 'filled',
    templateFindings: [],
    ...overrides,
  }
}

function createMockSnapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  const files: Record<ExpectedCoreFile, SnapshotFileEntry> = {} as Record<
    ExpectedCoreFile,
    SnapshotFileEntry
  >

  for (const file of EXPECTED_CORE_FILES) {
    files[file] = createMockFileEntry(file)
  }

  return {
    projectName: 'TestProject',
    projectPath: '/vault/Projects/TestProject',
    capturedAt: '2024-01-15T10:30:00.000Z',
    expectedFiles: [...EXPECTED_CORE_FILES],
    files,
    githubRepos: [],
    health: {
      missingFiles: [],
      thinOrTemplateFiles: [],
    },
    ...overrides,
  }
}

// ============================================================================
// Tests for formatProjectSnapshotForModel
// ============================================================================

describe('formatProjectSnapshotForModel', () => {
  describe('header section', () => {
    it('includes project name', () => {
      const snapshot = createMockSnapshot({ projectName: 'MyAwesomeProject' })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('PROJECT: MyAwesomeProject')
    })

    it('includes project path', () => {
      const snapshot = createMockSnapshot({
        projectPath: '/vault/Projects/TestProject',
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('PATH: /vault/Projects/TestProject')
    })

    it('includes captured timestamp', () => {
      const snapshot = createMockSnapshot({
        capturedAt: '2024-01-15T10:30:00.000Z',
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('CAPTURED: 2024-01-15T10:30:00.000Z')
    })
  })

  describe('GitHub repos section', () => {
    it('includes single GitHub repo', () => {
      const snapshot = createMockSnapshot({
        githubRepos: ['user/repo'],
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('GITHUB: user/repo')
    })

    it('includes multiple GitHub repos comma-separated', () => {
      const snapshot = createMockSnapshot({
        githubRepos: ['user/repo1', 'org/repo2', 'team/repo3'],
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('GITHUB: user/repo1, org/repo2, team/repo3')
    })

    it('shows "none" when no GitHub repos', () => {
      const snapshot = createMockSnapshot({ githubRepos: [] })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('GITHUB: none')
    })
  })

  describe('core files section', () => {
    it('includes CORE FILES header', () => {
      const snapshot = createMockSnapshot()
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('CORE FILES:')
    })

    it('lists all expected files', () => {
      const snapshot = createMockSnapshot()
      const output = formatProjectSnapshotForModel(snapshot)

      for (const file of EXPECTED_CORE_FILES) {
        expect(output).toContain(`- ${file}:`)
      }
    })

    it('shows "filled" status for filled files', () => {
      const snapshot = createMockSnapshot()
      snapshot.files['Overview.md'] = createMockFileEntry('Overview.md', {
        templateStatus: 'filled',
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toMatch(/- Overview\.md: filled/)
    })

    it('shows "template_only" status with reasons', () => {
      const snapshot = createMockSnapshot()
      snapshot.files['Roadmap.md'] = createMockFileEntry('Roadmap.md', {
        templateStatus: 'template_only',
        templateFindings: ['Only template headings/placeholders present'],
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toMatch(
        /- Roadmap\.md: template_only \(Only template headings\/placeholders present\)/,
      )
    })

    it('shows "thin" status with multiple reasons', () => {
      const snapshot = createMockSnapshot()
      snapshot.files['Log.md'] = createMockFileEntry('Log.md', {
        templateStatus: 'thin',
        templateFindings: ['Only 45 chars of non-template content', '2 unfilled placeholders'],
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toMatch(
        /- Log\.md: thin \(Only 45 chars of non-template content; 2 unfilled placeholders\)/,
      )
    })

    it('shows "missing" status for non-existent files', () => {
      const snapshot = createMockSnapshot()
      snapshot.files['Tasks.md'] = createMockFileEntry('Tasks.md', {
        exists: false,
        templateStatus: 'missing',
        templateFindings: ['File missing'],
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toMatch(/- Tasks\.md: missing/)
    })

    it('includes frontmatter for existing files', () => {
      const snapshot = createMockSnapshot()
      snapshot.files['Overview.md'] = createMockFileEntry('Overview.md', {
        frontmatter: { status: 'active', priority: 'high' },
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('frontmatter: status: active; priority: high')
    })

    it('shows "frontmatter: none" for empty frontmatter', () => {
      const snapshot = createMockSnapshot()
      snapshot.files['Overview.md'] = createMockFileEntry('Overview.md', {
        frontmatter: {},
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('frontmatter: none')
    })

    it('does not include frontmatter line for non-existent files', () => {
      const snapshot = createMockSnapshot()
      snapshot.files['Tasks.md'] = createMockFileEntry('Tasks.md', {
        exists: false,
        templateStatus: 'missing',
      })
      const output = formatProjectSnapshotForModel(snapshot)

      // Should have the status line but no frontmatter line after it
      const lines = output.split('\n')
      const tasksLineIndex = lines.findIndex((l) => l.includes('Tasks.md: missing'))
      expect(tasksLineIndex).toBeGreaterThan(-1)
      // Next line should not be frontmatter for Tasks.md
      const nextLine = lines[tasksLineIndex + 1]
      // nextLine could be undefined if Tasks.md is last, or could be another file
      // Either way, it should not contain "frontmatter:" specifically for Tasks.md
      if (nextLine !== undefined) {
        // If the next line contains frontmatter:, it should be for the next file, not Tasks.md
        // Actually, in the current format, each file's frontmatter is on the line right after its status
        // So if Tasks.md doesn't exist, there should be NO frontmatter line immediately following it
        expect(nextLine.trim().startsWith('frontmatter:')).toBe(false)
      }
    })
  })

  describe('health summary section', () => {
    it('includes MISSING section when files are missing', () => {
      const snapshot = createMockSnapshot({
        health: {
          missingFiles: ['Tasks.md', 'Archive.md'],
          thinOrTemplateFiles: [],
        },
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('MISSING: Tasks.md, Archive.md')
    })

    it('does not include MISSING section when no files missing', () => {
      const snapshot = createMockSnapshot({
        health: {
          missingFiles: [],
          thinOrTemplateFiles: [],
        },
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).not.toContain('MISSING:')
    })

    it('includes NEEDS FILLING section for thin/template files', () => {
      const snapshot = createMockSnapshot({
        health: {
          missingFiles: [],
          thinOrTemplateFiles: [
            {
              file: 'Roadmap.md',
              status: 'template_only',
              reasons: ['Only placeholders remain'],
            },
            {
              file: 'Log.md',
              status: 'thin',
              reasons: ['Only 30 chars'],
            },
          ],
        },
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('NEEDS FILLING:')
      expect(output).toContain('- Roadmap.md: template_only (Only placeholders remain)')
      expect(output).toContain('- Log.md: thin (Only 30 chars)')
    })

    it('does not include NEEDS FILLING section when no weak files', () => {
      const snapshot = createMockSnapshot({
        health: {
          missingFiles: [],
          thinOrTemplateFiles: [],
        },
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).not.toContain('NEEDS FILLING:')
    })
  })

  describe('frontmatter serialization', () => {
    it('serializes string values directly', () => {
      const snapshot = createMockSnapshot()
      snapshot.files['Overview.md'] = createMockFileEntry('Overview.md', {
        frontmatter: { title: 'My Project', status: 'active' },
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('title: My Project')
      expect(output).toContain('status: active')
    })

    it('serializes non-string values as JSON', () => {
      const snapshot = createMockSnapshot()
      snapshot.files['Overview.md'] = createMockFileEntry('Overview.md', {
        frontmatter: {
          tags: ['project', 'active'],
          metadata: { priority: 1 },
        },
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('tags: ["project","active"]')
      expect(output).toContain('metadata: {"priority":1}')
    })

    it('handles boolean values', () => {
      const snapshot = createMockSnapshot()
      snapshot.files['Overview.md'] = createMockFileEntry('Overview.md', {
        frontmatter: { archived: false, featured: true },
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('archived: false')
      expect(output).toContain('featured: true')
    })

    it('handles numeric values', () => {
      const snapshot = createMockSnapshot()
      snapshot.files['Overview.md'] = createMockFileEntry('Overview.md', {
        frontmatter: { priority: 1, version: 2.5 },
      })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('priority: 1')
      expect(output).toContain('version: 2.5')
    })
  })

  describe('output format', () => {
    it('produces well-structured multi-line output', () => {
      const snapshot = createMockSnapshot({
        projectName: 'TestProject',
        githubRepos: ['user/repo'],
      })
      const output = formatProjectSnapshotForModel(snapshot)

      // Check that it has proper line breaks
      const lines = output.split('\n')
      expect(lines.length).toBeGreaterThan(10) // Should have multiple lines
    })

    it('separates sections with blank lines', () => {
      const snapshot = createMockSnapshot()
      const output = formatProjectSnapshotForModel(snapshot)

      // Check for section separation
      expect(output).toContain('\n\nCORE FILES:')
    })

    it('is deterministic (same input produces same output)', () => {
      const snapshot = createMockSnapshot()

      const output1 = formatProjectSnapshotForModel(snapshot)
      const output2 = formatProjectSnapshotForModel(snapshot)

      expect(output1).toBe(output2)
    })
  })

  describe('edge cases', () => {
    it('handles empty project name', () => {
      const snapshot = createMockSnapshot({ projectName: '' })
      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('PROJECT: ')
    })

    it('handles all files missing', () => {
      const snapshot = createMockSnapshot({
        health: {
          missingFiles: [...EXPECTED_CORE_FILES],
          thinOrTemplateFiles: [],
        },
      })

      // Mark all files as not existing
      for (const file of EXPECTED_CORE_FILES) {
        snapshot.files[file] = createMockFileEntry(file, {
          exists: false,
          templateStatus: 'missing',
          templateFindings: ['File missing'],
        })
      }

      const output = formatProjectSnapshotForModel(snapshot)

      expect(output).toContain('MISSING:')
      for (const file of EXPECTED_CORE_FILES) {
        expect(output).toContain(`- ${file}: missing`)
      }
    })

    it('handles special characters in frontmatter values', () => {
      const snapshot = createMockSnapshot()
      snapshot.files['Overview.md'] = createMockFileEntry('Overview.md', {
        frontmatter: {
          description: 'A "quoted" value with: colons',
          path: '/some/path/here',
        },
      })
      const output = formatProjectSnapshotForModel(snapshot)

      // Should handle special chars without breaking
      expect(output).toContain('description: A "quoted" value with: colons')
    })

    it('handles very long frontmatter values', () => {
      const snapshot = createMockSnapshot()
      const longValue = 'x'.repeat(500)
      snapshot.files['Overview.md'] = createMockFileEntry('Overview.md', {
        frontmatter: { longField: longValue },
      })

      // Should not throw
      const output = formatProjectSnapshotForModel(snapshot)
      expect(output).toContain(`longField: ${longValue}`)
    })
  })
})

// ============================================================================
// Tests for buildProjectQAPrompt
// ============================================================================

describe('buildProjectQAPrompt', () => {
  describe('basic structure', () => {
    it('includes snapshot summary', () => {
      const snapshotSummary = 'PROJECT: TestProject\nPATH: /vault/Projects/TestProject'
      const prompt = buildProjectQAPrompt(snapshotSummary, [])
      expect(prompt).toContain('PROJECT: TestProject')
    })

    it('includes JARVIS voice guidance', () => {
      const prompt = buildProjectQAPrompt('PROJECT: Test', [])
      expect(prompt).toContain('JARVIS')
      expect(prompt).toContain('sir')
    })

    it('includes language rules', () => {
      const prompt = buildProjectQAPrompt('PROJECT: Test', [])
      expect(prompt).toContain('Do NOT use these words')
    })
  })

  describe('tools section', () => {
    it('includes available tools when provided', () => {
      const tools = ['obsidian_get_file_contents', 'obsidian_search', 'obsidian_patch_content']
      const prompt = buildProjectQAPrompt('PROJECT: Test', tools)

      expect(prompt).toContain('AVAILABLE TOOLS:')
      expect(prompt).toContain('- obsidian_get_file_contents')
      expect(prompt).toContain('- obsidian_search')
      expect(prompt).toContain('- obsidian_patch_content')
    })

    it('shows note when no tools available', () => {
      const prompt = buildProjectQAPrompt('PROJECT: Test', [])
      expect(prompt).toContain('No tools are currently available')
    })

    it('includes tool usage guidelines when tools present', () => {
      const prompt = buildProjectQAPrompt('PROJECT: Test', ['obsidian_get_file_contents'])
      expect(prompt).toContain('TOOL USAGE GUIDELINES')
    })
  })

  describe('file paths section', () => {
    it('includes file paths guidance', () => {
      const prompt = buildProjectQAPrompt('PROJECT: TestProject', [])
      expect(prompt).toContain('FILE PATHS (CRITICAL')
    })

    it('extracts project name for path examples', () => {
      const snapshotSummary = 'PROJECT: MyProject\nPATH: /vault'
      const prompt = buildProjectQAPrompt(snapshotSummary, [])
      expect(prompt).toContain('./Projects/MyProject/')
    })
  })

  describe('template detection guidance', () => {
    it('includes template detection instructions', () => {
      const prompt = buildProjectQAPrompt('PROJECT: Test', [])
      expect(prompt).toContain('TEMPLATE DETECTION')
    })

    it('includes structure drift detection', () => {
      const prompt = buildProjectQAPrompt('PROJECT: Test', [])
      expect(prompt).toContain('TEMPLATE STRUCTURE DRIFT')
    })
  })

  describe('opening message guidance', () => {
    it('includes opening message requirements', () => {
      const prompt = buildProjectQAPrompt('PROJECT: Test', [])
      expect(prompt).toContain('OPENING MESSAGE (CRITICAL)')
    })

    it('includes good example', () => {
      const prompt = buildProjectQAPrompt('PROJECT: Test', [])
      expect(prompt).toContain('GOOD opening message')
    })

    it('includes bad example', () => {
      const prompt = buildProjectQAPrompt('PROJECT: Test', [])
      expect(prompt).toContain('BAD opening message')
    })
  })

  describe('hint format guidance', () => {
    it('includes hint format instructions', () => {
      const prompt = buildProjectQAPrompt('PROJECT: Test', [])
      expect(prompt).toContain('SYSTEM HINTS')
      expect(prompt).toContain('{{hint}}')
      expect(prompt).toContain('{{/hint}}')
    })
  })

  describe('time-appropriate greetings', () => {
    it('uses morning greeting for morning hours', () => {
      const prompt = buildProjectQAPrompt('PROJECT: Test', [], 9)
      expect(prompt).toContain('Good morning, sir')
    })

    it('uses afternoon greeting for afternoon hours', () => {
      const prompt = buildProjectQAPrompt('PROJECT: Test', [], 14)
      expect(prompt).toContain('Good afternoon, sir')
    })

    it('uses evening greeting for evening hours', () => {
      const prompt = buildProjectQAPrompt('PROJECT: Test', [], 21)
      expect(prompt).toContain('Good evening, sir')
    })
  })
})

// ============================================================================
// Tests for buildSystemPrompt (unified prompt builder)
// ============================================================================

describe('buildSystemPrompt', () => {
  describe('new project session', () => {
    it('includes project coaching context for new sessions', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'new',
        projectName: 'TestProject',
        oneLiner: 'A test project',
        planningLevel: 'Light spark',
      })
      expect(prompt).toContain('capture a project idea')
      expect(prompt).toContain('TEMPLATE-DRIVEN DISCOVERY')
      expect(prompt).toContain('PHASE TRANSITIONS')
    })

    it('includes JARVIS voice instructions', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'new',
      })
      expect(prompt).toContain('JARVIS')
      expect(prompt).toContain('sir')
      expect(prompt).toContain('polished, calm')
    })

    it('includes language rules', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'new',
      })
      expect(prompt).toContain('LANGUAGE RULES')
      expect(prompt).toContain('Do NOT use these words')
      expect(prompt).toContain('transform')
    })

    it('includes opening instructions for first message', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'new',
        isFirstMessage: true,
      })
      expect(prompt).toContain('OPENING MESSAGE')
      expect(prompt).toContain('What are we building today')
    })

    it('includes continuation instructions for follow-up messages', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'new',
        isFirstMessage: false,
      })
      expect(prompt).toContain('CONTINUATION')
      expect(prompt).toContain('Do NOT greet again')
    })

    it('includes covered topics when provided', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'new',
        coveredTopics: ['elevator_pitch', 'target_users'],
      })
      expect(prompt).toContain('Topics already discussed: elevator_pitch, target_users')
    })

    it('shows no topics covered for fresh conversations', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'new',
        coveredTopics: [],
      })
      expect(prompt).toContain('No topics covered yet')
    })

    it('includes planning context based on planning level', () => {
      const lightPrompt = buildSystemPrompt({
        sessionType: 'new',
        planningLevel: 'Light spark',
      })
      expect(lightPrompt).toContain('light/vague idea')

      const wellDefinedPrompt = buildSystemPrompt({
        sessionType: 'new',
        planningLevel: 'Well defined',
      })
      expect(wellDefinedPrompt).toContain('well defined')
    })

    it('uses correct time greeting based on hour', () => {
      const morningPrompt = buildSystemPrompt({
        sessionType: 'new',
        currentHour: 9,
      })
      expect(morningPrompt).toContain('Good morning, sir')

      const afternoonPrompt = buildSystemPrompt({
        sessionType: 'new',
        currentHour: 14,
      })
      expect(afternoonPrompt).toContain('Good afternoon, sir')

      const eveningPrompt = buildSystemPrompt({
        sessionType: 'new',
        currentHour: 20,
      })
      expect(eveningPrompt).toContain('Good evening, sir')
    })
  })

  describe('existing project session', () => {
    it('includes existing project context', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject\nPATH: /vault/TestProject',
      })
      expect(prompt).toContain('existing project')
      expect(prompt).toContain('SNAPSHOT')
      expect(prompt).toContain('TestProject')
    })

    it('includes tool section when tools are available', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject',
        toolsAvailable: ['obsidian_get_file_contents', 'obsidian_write_file'],
      })
      expect(prompt).toContain('AVAILABLE TOOLS')
      expect(prompt).toContain('obsidian_get_file_contents')
      expect(prompt).toContain('obsidian_write_file')
    })

    it('indicates no tools when none available', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject',
        toolsAvailable: [],
      })
      expect(prompt).toContain('No tools are currently available')
    })

    it('includes file path guidance', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: MyProject',
      })
      expect(prompt).toContain('FILE PATHS')
      expect(prompt).toContain('./Projects/MyProject/')
    })

    it('includes canonical templates section', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject',
      })
      expect(prompt).toContain('CANONICAL TEMPLATES')
    })

    it('includes template detection instructions', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject',
      })
      expect(prompt).toContain('TEMPLATE DETECTION')
      expect(prompt).toContain('placeholder')
    })

    it('includes hint format instructions', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject',
      })
      expect(prompt).toContain('SYSTEM HINTS')
      expect(prompt).toContain('{{hint}}')
      expect(prompt).toContain('{{/hint}}')
    })

    it('includes opening message instructions for first message', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject',
        isFirstMessage: true,
      })
      expect(prompt).toContain('OPENING MESSAGE (CRITICAL)')
      expect(prompt).toContain('SUBSTANTIVE and USEFUL')
    })

    it('includes continuation instructions for follow-up messages', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject',
        isFirstMessage: false,
      })
      expect(prompt).toContain('CONTINUATION')
      expect(prompt).not.toContain('OPENING MESSAGE (CRITICAL)')
    })

    it('includes JARVIS voice instructions', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject',
      })
      expect(prompt).toContain('JARVIS')
      expect(prompt).toContain('sir')
    })

    it('includes language rules', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject',
      })
      expect(prompt).toContain('LANGUAGE RULES')
      expect(prompt).toContain('Do NOT use these words')
    })
  })

  describe('workflow integration', () => {
    it('includes workflow overview for existing projects', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject',
      })
      expect(prompt).toContain('NAMED WORKFLOWS')
      expect(prompt).toContain('Synthesize')
      expect(prompt).toContain('Harvest Tasks')
      expect(prompt).toContain('Log Digest')
    })

    it('includes workflow execution contract', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject',
      })
      expect(prompt).toContain('WORKFLOW EXECUTION CONTRACT')
      expect(prompt).toContain('Stay inside the workflow')
      expect(prompt).toContain('Respect read/write boundaries')
    })

    it('includes log format standards', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject',
      })
      expect(prompt).toContain('LOG FORMAT STANDARD')
      expect(prompt).toContain('## YYYY-MM-DD')
      expect(prompt).toContain('### HH:MM — <Title>')
    })

    it('includes active workflow context when specified', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject',
        activeWorkflow: 'log-digest',
      })
      expect(prompt).toContain('ACTIVE WORKFLOW: Log Digest')
      expect(prompt).toContain('Log.md')
      expect(prompt).toContain('Stay strictly within this workflow')
    })

    it('does not include active workflow section when not specified', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject',
      })
      expect(prompt).not.toContain('ACTIVE WORKFLOW:')
    })

    it('includes specific rules for harvest-tasks workflow', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject',
        activeWorkflow: 'harvest-tasks',
      })
      expect(prompt).toContain('ACTIVE WORKFLOW: Harvest Tasks')
      expect(prompt).toContain('source reference')
      expect(prompt).toContain('Tasks.md')
    })

    it('includes specific rules for align-templates workflow', () => {
      const prompt = buildSystemPrompt({
        sessionType: 'existing',
        snapshotSummary: 'PROJECT: TestProject',
        activeWorkflow: 'align-templates',
      })
      expect(prompt).toContain('ACTIVE WORKFLOW: Align Templates')
      expect(prompt).toContain('**Cross-file moves:** Allowed')
      expect(prompt).toContain('**Risk level:** high')
    })
  })
})
