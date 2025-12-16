import { describe, it, expect, beforeEach } from 'bun:test'
import {
  getConversationState,
  saveConversationState,
  clearConversationState,
  hasConversationState,
  hasNewProjectInProgress,
  getNewProjectInProgress,
  saveNewProjectInProgress,
  clearNewProjectInProgress,
  setActiveExistingProject,
  getActiveExistingProject,
  clearActiveExistingProject,
  type StoredConversationState,
  type NewProjectInProgressState,
} from './conversation-store.ts'

// Helper to create a mock conversation state
function createMockConversationState(
  overrides: Partial<StoredConversationState> = {},
): StoredConversationState {
  return {
    messages: [
      { role: 'assistant', content: 'Hello, how can I help?', timestamp: '2024-01-15T10:00:00.000Z' },
      { role: 'user', content: 'I want to build a CLI tool', timestamp: '2024-01-15T10:01:00.000Z' },
    ],
    coveredTopics: ['core_purpose'],
    step: 'waiting_for_answer',
    summary: null,
    ...overrides,
  }
}

describe('conversation-store', () => {
  // Clean up store between tests
  beforeEach(() => {
    // Clear all known project paths we might have used
    clearConversationState('/path/to/project1')
    clearConversationState('/path/to/project2')
    clearConversationState('/path/to/project')
    clearConversationState('C:\\Users\\test\\vault\\project')
    clearNewProjectInProgress()
    clearActiveExistingProject()
  })

  describe('project conversation state', () => {
    describe('getConversationState', () => {
      it('returns null for non-existent project', () => {
        const state = getConversationState('/non/existent/path')
        expect(state).toBeNull()
      })

      it('returns saved state for existing project', () => {
        const mockState = createMockConversationState()
        saveConversationState('/path/to/project', mockState)

        const retrieved = getConversationState('/path/to/project')
        expect(retrieved).toEqual(mockState)
      })

      it('returns exact path match only', () => {
        const mockState = createMockConversationState()
        saveConversationState('/path/to/project', mockState)

        // Similar but different paths should not match
        expect(getConversationState('/path/to/project/')).toBeNull()
        expect(getConversationState('/path/to/project2')).toBeNull()
        expect(getConversationState('/path/to')).toBeNull()
      })
    })

    describe('saveConversationState', () => {
      it('saves new state', () => {
        const mockState = createMockConversationState()
        saveConversationState('/path/to/project', mockState)

        expect(getConversationState('/path/to/project')).toEqual(mockState)
      })

      it('overwrites existing state', () => {
        const state1 = createMockConversationState({ coveredTopics: ['topic1'] })
        const state2 = createMockConversationState({ coveredTopics: ['topic1', 'topic2'] })

        saveConversationState('/path/to/project', state1)
        saveConversationState('/path/to/project', state2)

        const retrieved = getConversationState('/path/to/project')
        expect(retrieved?.coveredTopics).toEqual(['topic1', 'topic2'])
      })

      it('handles multiple projects independently', () => {
        const state1 = createMockConversationState({ coveredTopics: ['topic1'] })
        const state2 = createMockConversationState({ coveredTopics: ['topic2'] })

        saveConversationState('/path/to/project1', state1)
        saveConversationState('/path/to/project2', state2)

        expect(getConversationState('/path/to/project1')?.coveredTopics).toEqual(['topic1'])
        expect(getConversationState('/path/to/project2')?.coveredTopics).toEqual(['topic2'])
      })

      it('handles Windows-style paths', () => {
        const mockState = createMockConversationState()
        saveConversationState('C:\\Users\\test\\vault\\project', mockState)

        expect(getConversationState('C:\\Users\\test\\vault\\project')).toEqual(mockState)
      })
    })

    describe('clearConversationState', () => {
      it('removes existing state', () => {
        const mockState = createMockConversationState()
        saveConversationState('/path/to/project', mockState)

        clearConversationState('/path/to/project')

        expect(getConversationState('/path/to/project')).toBeNull()
      })

      it('does nothing for non-existent project', () => {
        // Should not throw
        clearConversationState('/non/existent/path')
        expect(getConversationState('/non/existent/path')).toBeNull()
      })

      it('only clears specified project', () => {
        const state1 = createMockConversationState()
        const state2 = createMockConversationState()

        saveConversationState('/path/to/project1', state1)
        saveConversationState('/path/to/project2', state2)

        clearConversationState('/path/to/project1')

        expect(getConversationState('/path/to/project1')).toBeNull()
        expect(getConversationState('/path/to/project2')).not.toBeNull()
      })
    })

    describe('hasConversationState', () => {
      it('returns false for non-existent project', () => {
        expect(hasConversationState('/non/existent/path')).toBe(false)
      })

      it('returns true for existing project', () => {
        const mockState = createMockConversationState()
        saveConversationState('/path/to/project', mockState)

        expect(hasConversationState('/path/to/project')).toBe(true)
      })

      it('returns false after clearing', () => {
        const mockState = createMockConversationState()
        saveConversationState('/path/to/project', mockState)
        clearConversationState('/path/to/project')

        expect(hasConversationState('/path/to/project')).toBe(false)
      })
    })

    describe('conversation state data integrity', () => {
      it('preserves all message properties', () => {
        const mockState = createMockConversationState({
          messages: [
            { role: 'assistant', content: 'Hello!', timestamp: '2024-01-15T10:00:00.000Z' },
            { role: 'user', content: 'Help me plan', timestamp: '2024-01-15T10:01:00.000Z' },
            { role: 'assistant', content: 'What are you building?', timestamp: '2024-01-15T10:02:00.000Z' },
            { role: 'user', content: 'A CLI tool', timestamp: '2024-01-15T10:03:00.000Z' },
          ],
        })

        saveConversationState('/path/to/project', mockState)
        const retrieved = getConversationState('/path/to/project')

        expect(retrieved?.messages).toHaveLength(4)
        expect(retrieved?.messages[0]).toEqual({ role: 'assistant', content: 'Hello!', timestamp: '2024-01-15T10:00:00.000Z' })
        expect(retrieved?.messages[3]).toEqual({ role: 'user', content: 'A CLI tool', timestamp: '2024-01-15T10:03:00.000Z' })
      })

      it('preserves complex step values', () => {
        const states: StoredConversationState[] = [
          createMockConversationState({ step: 'generating_question' }),
          createMockConversationState({ step: 'waiting_for_answer' }),
          createMockConversationState({ step: 'generating_summary' }),
          createMockConversationState({ step: 'showing_summary' }),
          createMockConversationState({ step: 'extracting_data' }),
          createMockConversationState({ step: 'error' }),
        ]

        for (const state of states) {
          saveConversationState('/path/to/project', state)
          const retrieved = getConversationState('/path/to/project')
          expect(retrieved?.step).toBe(state.step)
        }
      })

      it('preserves summary content', () => {
        const mockState = createMockConversationState({
          summary: 'This is a comprehensive summary of the project discussion.',
        })

        saveConversationState('/path/to/project', mockState)
        const retrieved = getConversationState('/path/to/project')

        expect(retrieved?.summary).toBe('This is a comprehensive summary of the project discussion.')
      })

      it('preserves empty arrays', () => {
        const mockState = createMockConversationState({
          messages: [],
          coveredTopics: [],
        })

        saveConversationState('/path/to/project', mockState)
        const retrieved = getConversationState('/path/to/project')

        expect(retrieved?.messages).toEqual([])
        expect(retrieved?.coveredTopics).toEqual([])
      })
    })
  })

  describe('new project in-progress state', () => {
    describe('hasNewProjectInProgress', () => {
      it('returns false when no new project in progress', () => {
        expect(hasNewProjectInProgress()).toBe(false)
      })

      it('returns true when new project is in progress', () => {
        const state: NewProjectInProgressState = {
          conversationState: createMockConversationState(),
          planningLevel: 'Light spark',
          projectName: 'Test Project',
          oneLiner: 'A test project',
        }

        saveNewProjectInProgress(state)
        expect(hasNewProjectInProgress()).toBe(true)
      })

      it('returns false after clearing', () => {
        const state: NewProjectInProgressState = {
          conversationState: createMockConversationState(),
          planningLevel: 'Light spark',
          projectName: 'Test Project',
          oneLiner: 'A test project',
        }

        saveNewProjectInProgress(state)
        clearNewProjectInProgress()

        expect(hasNewProjectInProgress()).toBe(false)
      })
    })

    describe('getNewProjectInProgress', () => {
      it('returns null when no new project in progress', () => {
        expect(getNewProjectInProgress()).toBeNull()
      })

      it('returns saved state when new project is in progress', () => {
        const state: NewProjectInProgressState = {
          conversationState: createMockConversationState({
            coveredTopics: ['core_purpose', 'target_users'],
          }),
          planningLevel: 'Some notes',
          projectName: 'My CLI Tool',
          oneLiner: 'A command-line interface for productivity',
        }

        saveNewProjectInProgress(state)
        const retrieved = getNewProjectInProgress()

        expect(retrieved).not.toBeNull()
        expect(retrieved?.projectName).toBe('My CLI Tool')
        expect(retrieved?.planningLevel).toBe('Some notes')
        expect(retrieved?.oneLiner).toBe('A command-line interface for productivity')
        expect(retrieved?.conversationState.coveredTopics).toEqual(['core_purpose', 'target_users'])
      })
    })

    describe('saveNewProjectInProgress', () => {
      it('saves new project state', () => {
        const state: NewProjectInProgressState = {
          conversationState: createMockConversationState(),
          planningLevel: 'Well defined',
          projectName: 'Project X',
          oneLiner: 'The next big thing',
        }

        saveNewProjectInProgress(state)
        expect(getNewProjectInProgress()).not.toBeNull()
      })

      it('overwrites existing in-progress state', () => {
        const state1: NewProjectInProgressState = {
          conversationState: createMockConversationState(),
          planningLevel: 'Light spark',
          projectName: 'Project 1',
          oneLiner: 'First project',
        }

        const state2: NewProjectInProgressState = {
          conversationState: createMockConversationState(),
          planningLevel: 'Well defined',
          projectName: 'Project 2',
          oneLiner: 'Second project',
        }

        saveNewProjectInProgress(state1)
        saveNewProjectInProgress(state2)

        const retrieved = getNewProjectInProgress()
        expect(retrieved?.projectName).toBe('Project 2')
        expect(retrieved?.oneLiner).toBe('Second project')
      })
    })

    describe('clearNewProjectInProgress', () => {
      it('clears in-progress state', () => {
        const state: NewProjectInProgressState = {
          conversationState: createMockConversationState(),
          planningLevel: 'Light spark',
          projectName: 'Test',
          oneLiner: 'Test',
        }

        saveNewProjectInProgress(state)
        clearNewProjectInProgress()

        expect(hasNewProjectInProgress()).toBe(false)
        expect(getNewProjectInProgress()).toBeNull()
      })

      it('does nothing when no in-progress state', () => {
        // Should not throw
        clearNewProjectInProgress()
        expect(hasNewProjectInProgress()).toBe(false)
      })
    })
  })

  describe('active existing project tracking', () => {
    describe('setActiveExistingProject', () => {
      it('sets active project info', () => {
        setActiveExistingProject({
          name: 'Lachesis',
          path: '/vault/projects/Lachesis',
        })

        const active = getActiveExistingProject()
        expect(active).not.toBeNull()
        expect(active?.name).toBe('Lachesis')
        expect(active?.path).toBe('/vault/projects/Lachesis')
      })

      it('overwrites previous active project', () => {
        setActiveExistingProject({
          name: 'Project 1',
          path: '/vault/projects/Project1',
        })

        setActiveExistingProject({
          name: 'Project 2',
          path: '/vault/projects/Project2',
        })

        const active = getActiveExistingProject()
        expect(active?.name).toBe('Project 2')
        expect(active?.path).toBe('/vault/projects/Project2')
      })
    })

    describe('getActiveExistingProject', () => {
      it('returns null when no active project', () => {
        expect(getActiveExistingProject()).toBeNull()
      })

      it('returns active project info', () => {
        setActiveExistingProject({
          name: 'My Project',
          path: '/path/to/my-project',
        })

        const active = getActiveExistingProject()
        expect(active).toEqual({
          name: 'My Project',
          path: '/path/to/my-project',
        })
      })
    })

    describe('clearActiveExistingProject', () => {
      it('clears active project', () => {
        setActiveExistingProject({
          name: 'Test',
          path: '/test',
        })

        clearActiveExistingProject()
        expect(getActiveExistingProject()).toBeNull()
      })

      it('does nothing when no active project', () => {
        // Should not throw
        clearActiveExistingProject()
        expect(getActiveExistingProject()).toBeNull()
      })
    })
  })

  describe('isolation between stores', () => {
    it('project conversation state is independent from new project state', () => {
      const projectState = createMockConversationState({ coveredTopics: ['project'] })
      const newProjectState: NewProjectInProgressState = {
        conversationState: createMockConversationState({ coveredTopics: ['new'] }),
        planningLevel: 'Light',
        projectName: 'New',
        oneLiner: 'New project',
      }

      saveConversationState('/path/to/project', projectState)
      saveNewProjectInProgress(newProjectState)

      // Both should exist independently
      expect(getConversationState('/path/to/project')?.coveredTopics).toEqual(['project'])
      expect(getNewProjectInProgress()?.conversationState.coveredTopics).toEqual(['new'])

      // Clearing one shouldn't affect the other
      clearConversationState('/path/to/project')
      expect(getNewProjectInProgress()).not.toBeNull()

      saveConversationState('/path/to/project', projectState)
      clearNewProjectInProgress()
      expect(getConversationState('/path/to/project')).not.toBeNull()
    })

    it('active project tracking is independent from conversation state', () => {
      const mockState = createMockConversationState()
      saveConversationState('/path/to/project', mockState)
      setActiveExistingProject({ name: 'Active', path: '/path/to/active' })

      // Both should exist
      expect(getConversationState('/path/to/project')).not.toBeNull()
      expect(getActiveExistingProject()).not.toBeNull()

      // Clearing conversation doesn't affect active tracking
      clearConversationState('/path/to/project')
      expect(getActiveExistingProject()).not.toBeNull()

      // Clearing active doesn't affect other conversation states
      saveConversationState('/path/to/project', mockState)
      clearActiveExistingProject()
      expect(getConversationState('/path/to/project')).not.toBeNull()
    })
  })
})
