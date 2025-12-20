import { describe, it, expect } from 'bun:test'
import {
  isValidTransition,
  getValidNextSteps,
  isTerminalState,
  canRetryFromError,
  isInputStep,
  isProcessingStep,
  isSuccessStep,
  isFailureStep,
  getStepDescription,
  getStepProgress,
  INPUT_STEPS,
  PROCESSING_STEPS,
  SUCCESS_STEPS,
  FAILURE_STEPS,
  STEP_DESCRIPTIONS,
} from './session-transitions.ts'
import type { SessionStep } from './types.ts'

describe('session-transitions', () => {
  describe('isValidTransition', () => {
    describe('from idle', () => {
      it('allows transition to generating_question', () => {
        expect(isValidTransition('idle', 'generating_question')).toBe(true)
      })

      it('allows transition to error', () => {
        expect(isValidTransition('idle', 'error')).toBe(true)
      })

      it('rejects invalid transitions', () => {
        expect(isValidTransition('idle', 'waiting_for_answer')).toBe(false)
        expect(isValidTransition('idle', 'complete')).toBe(false)
        expect(isValidTransition('idle', 'naming_project')).toBe(false)
      })
    })

    describe('from generating_question', () => {
      it('allows transition to waiting_for_answer', () => {
        expect(isValidTransition('generating_question', 'waiting_for_answer')).toBe(true)
      })

      it('allows transition to error', () => {
        expect(isValidTransition('generating_question', 'error')).toBe(true)
      })

      it('rejects going backwards', () => {
        expect(isValidTransition('generating_question', 'idle')).toBe(false)
      })
    })

    describe('from waiting_for_answer', () => {
      it('allows transition to generating_question (for follow-up)', () => {
        expect(isValidTransition('waiting_for_answer', 'generating_question')).toBe(true)
      })

      it('allows transition to generating_names', () => {
        expect(isValidTransition('waiting_for_answer', 'generating_names')).toBe(true)
      })

      it('allows transition to error', () => {
        expect(isValidTransition('waiting_for_answer', 'error')).toBe(true)
      })

      it('rejects direct jump to extraction', () => {
        expect(isValidTransition('waiting_for_answer', 'extracting_data')).toBe(false)
      })
    })

    describe('from generating_names', () => {
      it('allows transition to naming_project', () => {
        expect(isValidTransition('generating_names', 'naming_project')).toBe(true)
      })

      it('allows transition to extracting_data (fallback)', () => {
        expect(isValidTransition('generating_names', 'extracting_data')).toBe(true)
      })

      it('allows transition to error', () => {
        expect(isValidTransition('generating_names', 'error')).toBe(true)
      })
    })

    describe('from naming_project', () => {
      it('allows transition to extracting_data', () => {
        expect(isValidTransition('naming_project', 'extracting_data')).toBe(true)
      })

      it('allows transition to error', () => {
        expect(isValidTransition('naming_project', 'error')).toBe(true)
      })

      it('rejects going back to conversation', () => {
        expect(isValidTransition('naming_project', 'waiting_for_answer')).toBe(false)
      })
    })

    describe('from extracting_data', () => {
      it('allows transition to ready_to_scaffold', () => {
        expect(isValidTransition('extracting_data', 'ready_to_scaffold')).toBe(true)
      })

      it('allows transition to error', () => {
        expect(isValidTransition('extracting_data', 'error')).toBe(true)
      })
    })

    describe('from ready_to_scaffold', () => {
      it('allows transition to scaffolding', () => {
        expect(isValidTransition('ready_to_scaffold', 'scaffolding')).toBe(true)
      })

      it('allows transition to error', () => {
        expect(isValidTransition('ready_to_scaffold', 'error')).toBe(true)
      })
    })

    describe('from scaffolding', () => {
      it('allows transition to complete', () => {
        expect(isValidTransition('scaffolding', 'complete')).toBe(true)
      })

      it('allows transition to error', () => {
        expect(isValidTransition('scaffolding', 'error')).toBe(true)
      })
    })

    describe('from complete (terminal)', () => {
      it('rejects all transitions', () => {
        const allSteps: SessionStep[] = [
          'idle', 'generating_question', 'waiting_for_answer',
          'generating_names', 'naming_project', 'extracting_data',
          'ready_to_scaffold', 'scaffolding', 'complete', 'error'
        ]

        for (const step of allSteps) {
          expect(isValidTransition('complete', step)).toBe(false)
        }
      })
    })

    describe('from error (recovery)', () => {
      it('allows transition to idle for fresh restart', () => {
        expect(isValidTransition('error', 'idle')).toBe(true)
      })

      it('allows transition to generating_question for retry', () => {
        expect(isValidTransition('error', 'generating_question')).toBe(true)
      })

      it('rejects other transitions', () => {
        expect(isValidTransition('error', 'complete')).toBe(false)
        expect(isValidTransition('error', 'scaffolding')).toBe(false)
      })
    })
  })

  describe('getValidNextSteps', () => {
    it('returns valid next steps for each state', () => {
      expect(getValidNextSteps('idle')).toEqual(['generating_question', 'error'])
      expect(getValidNextSteps('generating_question')).toEqual(['waiting_for_answer', 'error'])
      expect(getValidNextSteps('waiting_for_answer')).toEqual(['generating_question', 'generating_names', 'error'])
      expect(getValidNextSteps('complete')).toEqual([])
    })

    it('includes error as option for most states', () => {
      const stepsWithError: SessionStep[] = [
        'idle', 'generating_question', 'waiting_for_answer',
        'generating_names', 'naming_project', 'extracting_data',
        'ready_to_scaffold', 'scaffolding'
      ]

      for (const step of stepsWithError) {
        expect(getValidNextSteps(step)).toContain('error')
      }
    })
  })

  describe('isTerminalState', () => {
    it('returns true for complete', () => {
      expect(isTerminalState('complete')).toBe(true)
    })

    it('returns false for error (has recovery options)', () => {
      expect(isTerminalState('error')).toBe(false)
    })

    it('returns false for non-terminal states', () => {
      const nonTerminal: SessionStep[] = [
        'idle', 'generating_question', 'waiting_for_answer',
        'generating_names', 'naming_project', 'extracting_data',
        'ready_to_scaffold', 'scaffolding'
      ]

      for (const step of nonTerminal) {
        expect(isTerminalState(step)).toBe(false)
      }
    })
  })

  describe('canRetryFromError', () => {
    it('returns true for error state', () => {
      expect(canRetryFromError('error')).toBe(true)
    })

    it('returns false for other states', () => {
      expect(canRetryFromError('idle')).toBe(false)
      expect(canRetryFromError('complete')).toBe(false)
      expect(canRetryFromError('generating_question')).toBe(false)
    })
  })

  describe('step category checks', () => {
    describe('isInputStep', () => {
      it('returns true for waiting_for_answer', () => {
        expect(isInputStep('waiting_for_answer')).toBe(true)
      })

      it('returns true for naming_project', () => {
        expect(isInputStep('naming_project')).toBe(true)
      })

      it('returns false for processing steps', () => {
        expect(isInputStep('generating_question')).toBe(false)
        expect(isInputStep('extracting_data')).toBe(false)
      })
    })

    describe('isProcessingStep', () => {
      it('returns true for AI processing steps', () => {
        expect(isProcessingStep('generating_question')).toBe(true)
        expect(isProcessingStep('generating_names')).toBe(true)
        expect(isProcessingStep('extracting_data')).toBe(true)
        expect(isProcessingStep('scaffolding')).toBe(true)
      })

      it('returns false for input steps', () => {
        expect(isProcessingStep('waiting_for_answer')).toBe(false)
        expect(isProcessingStep('naming_project')).toBe(false)
      })
    })

    describe('isSuccessStep', () => {
      it('returns true for complete', () => {
        expect(isSuccessStep('complete')).toBe(true)
      })

      it('returns false for other states', () => {
        expect(isSuccessStep('idle')).toBe(false)
        expect(isSuccessStep('error')).toBe(false)
        expect(isSuccessStep('scaffolding')).toBe(false)
      })
    })

    describe('isFailureStep', () => {
      it('returns true for error', () => {
        expect(isFailureStep('error')).toBe(true)
      })

      it('returns false for other states', () => {
        expect(isFailureStep('complete')).toBe(false)
        expect(isFailureStep('idle')).toBe(false)
      })
    })
  })

  describe('step constants', () => {
    it('INPUT_STEPS contains correct steps', () => {
      expect(INPUT_STEPS).toContain('waiting_for_answer')
      expect(INPUT_STEPS).toContain('naming_project')
      expect(INPUT_STEPS).not.toContain('generating_question')
    })

    it('PROCESSING_STEPS contains correct steps', () => {
      expect(PROCESSING_STEPS).toContain('generating_question')
      expect(PROCESSING_STEPS).toContain('generating_names')
      expect(PROCESSING_STEPS).toContain('extracting_data')
      expect(PROCESSING_STEPS).toContain('scaffolding')
    })

    it('SUCCESS_STEPS contains only complete', () => {
      expect(SUCCESS_STEPS).toEqual(['complete'])
    })

    it('FAILURE_STEPS contains only error', () => {
      expect(FAILURE_STEPS).toEqual(['error'])
    })
  })

  describe('getStepDescription', () => {
    it('returns description for all known steps', () => {
      const allSteps: SessionStep[] = [
        'idle', 'generating_question', 'waiting_for_answer',
        'generating_names', 'naming_project', 'extracting_data',
        'ready_to_scaffold', 'scaffolding', 'complete', 'error'
      ]

      for (const step of allSteps) {
        const desc = getStepDescription(step)
        expect(desc).toBeDefined()
        expect(desc.length).toBeGreaterThan(0)
      }
    })

    it('returns meaningful descriptions', () => {
      expect(getStepDescription('idle')).toBe('Session created')
      expect(getStepDescription('complete')).toBe('Project created successfully')
      expect(getStepDescription('error')).toBe('An error occurred')
    })

    it('STEP_DESCRIPTIONS has entry for all steps', () => {
      const allSteps: SessionStep[] = [
        'idle', 'generating_question', 'waiting_for_answer',
        'generating_names', 'naming_project', 'extracting_data',
        'ready_to_scaffold', 'scaffolding', 'complete', 'error'
      ]

      for (const step of allSteps) {
        expect(STEP_DESCRIPTIONS[step]).toBeDefined()
      }
    })
  })

  describe('getStepProgress', () => {
    it('returns 0 for error state', () => {
      expect(getStepProgress('error')).toBe(0)
    })

    it('returns 100 for complete state', () => {
      expect(getStepProgress('complete')).toBe(100)
    })

    it('returns 20 for conversation steps', () => {
      expect(getStepProgress('generating_question')).toBe(20)
      expect(getStepProgress('waiting_for_answer')).toBe(20)
    })

    it('returns increasing progress for later steps', () => {
      const namesProgress = getStepProgress('generating_names')
      const namingProgress = getStepProgress('naming_project')
      const extractingProgress = getStepProgress('extracting_data')
      const readyProgress = getStepProgress('ready_to_scaffold')
      const scaffoldingProgress = getStepProgress('scaffolding')

      expect(namesProgress).toBeGreaterThanOrEqual(40)
      expect(namingProgress).toBeGreaterThanOrEqual(namesProgress)
      expect(extractingProgress).toBeGreaterThanOrEqual(namingProgress)
      expect(readyProgress).toBeGreaterThanOrEqual(extractingProgress)
      expect(scaffoldingProgress).toBeGreaterThanOrEqual(readyProgress)
      expect(scaffoldingProgress).toBeLessThan(100)
    })

    it('returns progress between 0 and 100', () => {
      const allSteps: SessionStep[] = [
        'idle', 'generating_question', 'waiting_for_answer',
        'generating_names', 'naming_project', 'extracting_data',
        'ready_to_scaffold', 'scaffolding', 'complete', 'error'
      ]

      for (const step of allSteps) {
        const progress = getStepProgress(step)
        expect(progress).toBeGreaterThanOrEqual(0)
        expect(progress).toBeLessThanOrEqual(100)
      }
    })
  })
})
