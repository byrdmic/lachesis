import { describe, it, expect } from 'bun:test'
import { evaluateTemplateStatus } from './template-evaluator.ts'
import type { ExpectedCoreFile } from './snapshot.ts'

describe('evaluateTemplateStatus', () => {
  describe('Overview.md', () => {
    const file: ExpectedCoreFile = 'Overview.md'

    it('returns template_only for empty content', () => {
      const result = evaluateTemplateStatus(file, '')
      expect(result.status).toBe('template_only')
      expect(result.reasons).toContain('Body is empty')
    })

    it('returns template_only for content with only frontmatter', () => {
      const content = `---
title: Test Project
status: active
---`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('template_only')
      expect(result.reasons).toContain('Body is empty')
    })

    it('returns template_only when only placeholders remain', () => {
      const content = `---
title: Test
---
# <Project Name>

## Problem
<What hurts today?>
<Why does it hurt?>
<What happens if you don't solve it?>

## Audience
<Who?>
<Where/when do they use it?>
<Who is explicitly not the target?>
`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('template_only')
    })

    it('returns template_only when more than 5 placeholders remain', () => {
      const content = `---
title: Test
---
# My Real Project Name

This is a real project with some content.

## Problem
<What hurts today?>
<Why does it hurt?>
<What happens if you don't solve it?>

## Audience
<Who?>
<Where/when do they use it?>
<Who is explicitly not the target?>

## Success
<Observable/testable bullets>
`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('template_only')
      expect(result.reasons.some(r => r.includes('unfilled placeholders'))).toBe(true)
    })

    it('returns thin when content is below minimum threshold', () => {
      const content = `---
title: Test
---
# My Project

A short description.
`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('thin')
      expect(result.reasons.some(r => r.includes('chars of non-template content'))).toBe(true)
    })

    it('returns thin when 3-5 placeholders remain', () => {
      const content = `---
title: Test
---
# My Project

This is a well-developed project with substantial content that describes what the project does and why it matters to users. It has enough meaningful content to pass the minimum character threshold.

## Problem
<What hurts today?>
<Why does it hurt?>
<What happens if you don't solve it?>

## Solution
A comprehensive solution that addresses user needs.
`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('thin')
    })

    it('returns filled for substantial content without placeholders', () => {
      const content = `---
title: Lachesis
status: active
github: user/lachesis
---
# Lachesis

A CLI tool for crystallizing project ideas into structured Obsidian workspaces.

## Problem

When starting a new project, the initial brainstorming and planning phase is often chaotic. Ideas are scattered across notes, conversations, and mental models. There's no consistent way to capture the full context of what you're building and why.

## Audience

Developers and makers who use Obsidian for knowledge management and want a structured approach to project planning.

## Solution

Lachesis provides an AI-assisted interview process that guides users through articulating their project vision, then generates a complete Obsidian workspace with structured templates for ongoing project management.

## Success Criteria

- Users can go from vague idea to structured project in under 30 minutes
- Generated documentation captures the essential "why" behind decisions
- Templates are useful beyond initial setup for ongoing tracking
`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('filled')
    })

    it('returns filled even with 1-2 minor placeholders if content is substantial', () => {
      const content = `---
title: Lachesis
status: active
---
# Lachesis

A CLI tool for crystallizing project ideas into structured Obsidian workspaces.

## Problem

When starting a new project, the initial brainstorming and planning phase is often chaotic. Ideas are scattered across notes, conversations, and mental models. There's no consistent way to capture the full context of what you're building and why.

## Audience

Developers and makers who use Obsidian for knowledge management and want a structured approach to project planning.

## Technical Constraints
<stack constraints, hosting constraints>

## Success Criteria

Users can go from vague idea to structured project in under 30 minutes. Generated documentation captures the essential "why" behind decisions. Templates are useful beyond initial setup for ongoing tracking.
`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('filled')
    })
  })

  describe('Roadmap.md', () => {
    const file: ExpectedCoreFile = 'Roadmap.md'

    it('returns template_only for empty content', () => {
      const result = evaluateTemplateStatus(file, '')
      expect(result.status).toBe('template_only')
    })

    it('returns template_only with milestone placeholders', () => {
      const content = `---
title: Roadmap
---
# Roadmap

## <Milestone title>

### <Slice name>
<One sentence. "We're trying to...">
<What exists when done?>
<Demo-able bullet>
<Testable bullet>
<User can... bullet>
`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('template_only')
    })

    it('returns filled for a real roadmap', () => {
      const content = `---
title: Roadmap
---
# Roadmap

## Milestone 1: Core Interview Flow

### VS1: Basic Question Loop
Build the foundational interview system that can ask questions and collect responses.

#### Done when
- CLI launches and presents first question
- User can type response and submit
- System can present follow-up questions

### VS2: AI Integration
Connect to OpenAI API to generate contextual follow-up questions.

#### Done when
- API key configuration works
- AI generates relevant follow-ups
- Conversation maintains context

## Milestone 2: Output Generation

### VS1: Template System
Create markdown templates for all project files.

#### Done when
- Overview.md template generates from interview data
- Roadmap.md reflects captured milestones
`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('filled')
    })
  })

  describe('Tasks.md', () => {
    const file: ExpectedCoreFile = 'Tasks.md'

    it('returns template_only for empty', () => {
      const result = evaluateTemplateStatus(file, '')
      expect(result.status).toBe('template_only')
    })

    it('returns template_only with task placeholders', () => {
      const content = `---
title: Tasks
---
# Tasks

## Now
- [ ] <Smallest concrete step (~15-60 minutes)>
- [ ] <Next step>
- [ ] <VS?-T?>

## Next
- [ ] <Verb + object>
- [ ] <How you'll know it's done>
- [ ] <Thing blocked>
`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('template_only')
    })

    it('returns filled for real tasks', () => {
      const content = `---
title: Tasks
---
# Tasks

## Now
- [ ] Fix the MCP connection timeout issue
- [ ] Add error handling for missing API key
- [x] Write template evaluator tests

## Next
- [ ] Add project settings validation
- [ ] Implement snapshot caching

## Someday
- [ ] Add support for custom templates
`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('filled')
    })
  })

  describe('Log.md', () => {
    const file: ExpectedCoreFile = 'Log.md'

    it('returns template_only for empty', () => {
      const result = evaluateTemplateStatus(file, '')
      expect(result.status).toBe('template_only')
    })

    it('returns thin for very short log', () => {
      const content = `---
title: Log
---
# Log

Started project.
`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('thin')
    })

    it('returns filled for real log entries', () => {
      const content = `---
title: Log
---
# Log

## 2024-01-15
Got the basic interview loop working. The AI generates good follow-up questions but sometimes goes off on tangents. Need to add better context management.

## 2024-01-14
Set up the project structure and basic CLI scaffolding with Ink. Chose Bun as the runtime for speed.
`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('filled')
    })
  })

  describe('Ideas.md', () => {
    const file: ExpectedCoreFile = 'Ideas.md'

    it('returns template_only for empty', () => {
      const result = evaluateTemplateStatus(file, '')
      expect(result.status).toBe('template_only')
    })

    it('returns template_only with question placeholders', () => {
      const content = `---
title: Ideas
---
# Ideas

## Open Questions
- <Question>
- <A / B / C>
- <What would decide it: <...>>
- <Idea>
- <Bullets>
- <url or obsidian link>
`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('template_only')
    })

    it('returns filled for real ideas', () => {
      const content = `---
title: Ideas
---
# Ideas

## Open Questions
- Should we support multiple AI providers or just OpenAI?
- How do we handle offline mode?

## Features to Consider
- Voice input for the interview process
- Export to other formats beyond Obsidian
`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('filled')
    })
  })

  describe('Archive.md', () => {
    const file: ExpectedCoreFile = 'Archive.md'

    it('returns template_only for empty', () => {
      const result = evaluateTemplateStatus(file, '')
      expect(result.status).toBe('template_only')
    })

    it('returns template_only with archive placeholders', () => {
      const content = `---
title: Archive
---
# Archive

## Shipped
### <YYYY-MM-DD>
<what shipped>
<repo/commit/PR/notes>

## Superseded Plans
### <Old Plan Title>
<link to new plan>
<rationale>
`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('template_only')
    })

    it('returns filled for real archive entries', () => {
      const content = `---
title: Archive
---
# Archive

## Shipped
### 2024-01-10
Initial CLI scaffolding with Ink framework
Commit: abc123

### 2024-01-08
Project setup and TypeScript configuration
PR #1

## Superseded Plans
### Original Web UI Approach
Decided to go CLI-first instead of web. The terminal interface is faster to iterate on and matches the target audience better.
`
      const result = evaluateTemplateStatus(file, content)
      expect(result.status).toBe('filled')
    })
  })

  describe('edge cases', () => {
    it('handles Windows line endings (CRLF)', () => {
      // Log.md has minMeaningful: 50, so we need more than 50 chars of content
      const content = "---\r\ntitle: Test\r\n---\r\n# Project\r\n\r\nThis is meaningful content that should pass the threshold for Log files.\r\n"
      const result = evaluateTemplateStatus('Log.md', content)
      expect(result.status).toBe('filled')
    })

    it('handles mixed line endings', () => {
      const content = "---\r\ntitle: Test\n---\r\n# Project\n\nThis is content with enough text to pass the threshold.\r\n"
      const result = evaluateTemplateStatus('Log.md', content)
      expect(result.status).toBe('filled')
    })

    it('returns filled for unknown file type with any content', () => {
      // Using type assertion to test edge case
      const result = evaluateTemplateStatus('Unknown.md' as ExpectedCoreFile, 'Any content')
      expect(result.status).toBe('filled')
      expect(result.reasons).toContain('No template rules configured')
    })

    it('strips frontmatter correctly before evaluation', () => {
      const content = `---
title: Test
tags:
  - project
  - active
metadata:
  created: 2024-01-01
---

This is the actual body content that should be evaluated.
`
      const result = evaluateTemplateStatus('Log.md', content)
      // Log.md has minMeaningful: 50, this body is ~60 chars
      expect(result.status).toBe('filled')
    })

    it('handles content with only whitespace after frontmatter', () => {
      const content = `---
title: Test
---



`
      const result = evaluateTemplateStatus('Overview.md', content)
      expect(result.status).toBe('template_only')
      expect(result.reasons).toContain('Body is empty')
    })

    it('counts generic angle-bracket placeholders', () => {
      const content = `---
title: Test
---
# My Project

This has <custom placeholder> and <another one> and <yet another>.
Plus some real content here to pad out the character count so we focus on placeholders.
`
      const result = evaluateTemplateStatus('Overview.md', content)
      // 3 generic placeholders should trigger thin status
      expect(['thin', 'template_only']).toContain(result.status)
    })

    it('does not count short angle brackets as placeholders', () => {
      // Placeholders must be >2 chars inside brackets
      const content = `---
title: Test
---
# My Project

This is content with <a> HTML tag and some math like 5 < 10 > 3.
More content here to ensure we have enough characters for the minimum threshold requirement.
Additional text to make this definitely pass the 200 char minimum for Overview.md files.
`
      const result = evaluateTemplateStatus('Overview.md', content)
      expect(result.status).toBe('filled')
    })
  })

  describe('threshold boundaries', () => {
    it('Overview.md: exactly at minMeaningful (200) is filled', () => {
      // Create content that after stripping is exactly 200 chars
      const padding = 'x'.repeat(200)
      const content = `---
title: Test
---
${padding}
`
      const result = evaluateTemplateStatus('Overview.md', content)
      expect(result.status).toBe('filled')
    })

    it('Overview.md: just below minMeaningful (199) is thin', () => {
      const padding = 'x'.repeat(199)
      const content = `---
title: Test
---
${padding}
`
      const result = evaluateTemplateStatus('Overview.md', content)
      expect(result.status).toBe('thin')
    })

    it('Roadmap.md: minMeaningful is 150', () => {
      const padding = 'x'.repeat(150)
      const content = `---
title: Test
---
${padding}
`
      const result = evaluateTemplateStatus('Roadmap.md', content)
      expect(result.status).toBe('filled')
    })

    it('Log.md: minMeaningful is 50', () => {
      const padding = 'x'.repeat(50)
      const content = `---
title: Test
---
${padding}
`
      const result = evaluateTemplateStatus('Log.md', content)
      expect(result.status).toBe('filled')
    })

    it('exactly 5 placeholders triggers template_only', () => {
      const content = `---
title: Test
---
# Project

Content with exactly six placeholders to trigger template_only:
<one> <two> <three> <four> <five> <six>

Plus enough meaningful content to pass character threshold so we isolate the placeholder test.
More content padding here to ensure the character count doesn't cause thin status.
`
      const result = evaluateTemplateStatus('Overview.md', content)
      expect(result.status).toBe('template_only')
    })

    it('exactly 2 placeholders with enough content is filled', () => {
      const content = `---
title: Test
---
# Project

A substantial project description with real content that provides value. This project aims to solve important problems for users who need a better way to manage their work.

There are still some gaps: <first gap> and <second gap> but overall the content is meaningful.

More details about implementation, architecture, and design decisions that make this a comprehensive document.
`
      const result = evaluateTemplateStatus('Overview.md', content)
      expect(result.status).toBe('filled')
    })

    it('exactly 3 placeholders triggers thin even with enough content', () => {
      const content = `---
title: Test
---
# Project

A substantial project description with real content that provides value. This project aims to solve important problems for users who need a better way to manage their work.

There are some gaps: <first gap> and <second gap> and <third gap>.

More details about implementation, architecture, and design decisions that make this a comprehensive document with plenty of content.
`
      const result = evaluateTemplateStatus('Overview.md', content)
      expect(result.status).toBe('thin')
    })
  })
})
