// AdvisorChat.md template
import type { ProjectDefinition } from '../../core/project/types.ts'
import { generateBaseFrontmatter } from './frontmatter.ts'

export function generateAdvisorChat(project: ProjectDefinition): string {
  const advisors = project.advisorsConfig.advisors
  const participantNames = advisors.map((a) => a.humanName || a.name)

  const frontmatter = generateBaseFrontmatter(project, {
    extraFields: {
      advisor_chat_version: 1,
      participants: participantNames,
      session_id: 1,
      session_date: project.createdAt,
      topic: 'Project Initialization',
    },
  })

  const participantList =
    advisors.length > 0
      ? advisors
          .map((a) => `- ${a.humanName || a.name} (${a.archetype})`)
          .join('\n')
      : '- (no advisors assigned)'

  return `${frontmatter}
# Advisor Chat – Session 1

**Topic:** Project Initialization
**Participants:**
${participantList}

---

## 1. Brief Summary

This is the initial session for ${project.name}. ${
    advisors.length > 0
      ? `The board of advisors has been assembled with ${advisors.length} member(s).`
      : 'No advisors have been assigned to this project yet.'
  }

---

## 2. Key Recommendations

- (to be added after advisor discussions)

---

## 3. Decisions

- (to be added)

---

## 4. Transcript (optional)

> Paste or summarize advisor conversations here.

---

## 5. Follow-up Actions

- Review project overview and roadmap
- Consider which advisor perspectives would be most valuable first
`
}
