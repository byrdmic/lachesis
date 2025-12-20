import { describe, it, expect } from 'bun:test'
import {
  detectTopics,
  checkForTransitionPhrase,
} from './session-operations.ts'

describe('session-operations', () => {
  describe('detectTopics', () => {
    it('returns existing topics when no new ones detected', () => {
      const result = detectTopics('Hello, how are you?', ['elevator_pitch'])
      expect(result).toEqual(['elevator_pitch'])
    })

    it('detects elevator_pitch topic', () => {
      const result = detectTopics('What are you building today?', [])
      expect(result).toContain('elevator_pitch')
    })

    it('detects problem_statement topic', () => {
      const result = detectTopics('What problem does this solve?', [])
      expect(result).toContain('problem_statement')
    })

    it('detects target_users topic', () => {
      const result = detectTopics('Who will be using this tool?', [])
      expect(result).toContain('target_users')
    })

    it('detects value_proposition topic', () => {
      const result = detectTopics('What benefit does this provide?', [])
      expect(result).toContain('value_proposition')
    })

    it('detects scope_and_antigoals topic', () => {
      const result = detectTopics('What is in scope and what should you avoid?', [])
      expect(result).toContain('scope_and_antigoals')
    })

    it('detects constraints topic', () => {
      const result = detectTopics('What are your budget and time limitations?', [])
      expect(result).toContain('constraints')
    })

    it('detects multiple topics in one question', () => {
      const result = detectTopics('Who is the target audience and what problem does this solve?', [])
      expect(result).toContain('target_users')
      expect(result).toContain('problem_statement')
    })

    it('adds new topics to existing ones', () => {
      const existing = ['elevator_pitch', 'target_users']
      const result = detectTopics('What constraints do you have?', existing)
      expect(result).toContain('elevator_pitch')
      expect(result).toContain('target_users')
      expect(result).toContain('constraints')
      expect(result.length).toBeGreaterThan(existing.length)
    })

    it('does not duplicate existing topics', () => {
      const existing = ['elevator_pitch']
      const result = detectTopics('What are you building?', existing)
      const elevatorCount = result.filter(t => t === 'elevator_pitch').length
      expect(elevatorCount).toBe(1)
    })

    it('is case-insensitive', () => {
      const result1 = detectTopics('WHAT ARE YOU BUILDING?', [])
      const result2 = detectTopics('what are you building?', [])
      expect(result1).toEqual(result2)
    })

    describe('keyword detection', () => {
      it('detects "what is this" as elevator_pitch', () => {
        const result = detectTopics('What is this project about?', [])
        expect(result).toContain('elevator_pitch')
      })

      it('detects "describe" as elevator_pitch', () => {
        const result = detectTopics('Can you describe your idea?', [])
        expect(result).toContain('elevator_pitch')
      })

      it('detects "pain" as problem_statement', () => {
        const result = detectTopics('What pain points are you addressing?', [])
        expect(result).toContain('problem_statement')
      })

      it('detects "why build" as problem_statement', () => {
        const result = detectTopics('Why build this now?', [])
        expect(result).toContain('problem_statement')
      })

      it('detects "audience" as target_users', () => {
        const result = detectTopics('Who is your target audience?', [])
        expect(result).toContain('target_users')
      })

      it('detects "customer" as target_users', () => {
        const result = detectTopics('Who is your ideal customer?', [])
        expect(result).toContain('target_users')
      })

      it('detects "alternative" as value_proposition', () => {
        const result = detectTopics('What alternatives exist?', [])
        expect(result).toContain('value_proposition')
      })

      it('detects "anti-goal" as scope_and_antigoals', () => {
        const result = detectTopics('What are your anti-goals?', [])
        expect(result).toContain('scope_and_antigoals')
      })

      it('detects "should not become" as scope_and_antigoals', () => {
        const result = detectTopics("What shouldn't this become?", [])
        expect(result).toContain('scope_and_antigoals')
      })

      it('detects "budget" as constraints', () => {
        const result = detectTopics('What is your budget?', [])
        expect(result).toContain('constraints')
      })

      it('detects "deadline" as constraints', () => {
        const result = detectTopics('Do you have a deadline?', [])
        expect(result).toContain('constraints')
      })

      it('detects "tech stack" as constraints', () => {
        const result = detectTopics('What tech stack will you use?', [])
        expect(result).toContain('constraints')
      })
    })
  })

  describe('checkForTransitionPhrase', () => {
    it('returns true when transition phrase is present', () => {
      const text = 'Very well, sir. Let us proceed with naming your project.'
      expect(checkForTransitionPhrase(text)).toBe(true)
    })

    it('is case-insensitive', () => {
      const text = 'VERY WELL, SIR. LET US PROCEED!'
      expect(checkForTransitionPhrase(text)).toBe(true)
    })

    it('finds phrase anywhere in text', () => {
      const text = 'I understand your requirements. Very well, sir. Let us proceed to the next step.'
      expect(checkForTransitionPhrase(text)).toBe(true)
    })

    it('returns false when phrase is not present', () => {
      const text = 'Please tell me more about your project.'
      expect(checkForTransitionPhrase(text)).toBe(false)
    })

    it('returns false for partial matches', () => {
      const text1 = 'Very well, sir.'
      const text2 = 'Let us proceed.'
      expect(checkForTransitionPhrase(text1)).toBe(false)
      expect(checkForTransitionPhrase(text2)).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(checkForTransitionPhrase('')).toBe(false)
    })

    it('handles multiline text', () => {
      const text = `Thank you for your answers.

Very well, sir. Let us proceed.

I have gathered enough information.`
      expect(checkForTransitionPhrase(text)).toBe(true)
    })
  })
})
