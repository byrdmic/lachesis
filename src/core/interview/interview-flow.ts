// Interview Flow Controller - State machine for project interviews
// Manages phase transitions and orchestrates session manager calls

import type { Vault } from 'obsidian'
import type { LachesisSettings } from '../../settings'
import {
  createSessionManager,
  type SessionManagerConfig,
} from '../session/session-manager'
import type { ISessionManager, SessionState } from '../session/types'
import type { DiscoveryTopic } from './phases'
import { DISCOVERY_TOPICS } from './phases'

// ============================================================================
// Types
// ============================================================================

export type InterviewPhase = 'setup' | 'conversation' | 'naming' | 'complete' | 'error'

export type PlanningLevel = 'Light spark' | 'Some notes' | 'Well defined' | 'Quick Start'

export type PlanningLevelOption = {
  value: PlanningLevel
  label: string
  description: string
}

export type InterviewFlowEvents = {
  onPhaseChange: (phase: InterviewPhase, error?: string) => void
  onSessionUpdate: (session: SessionState) => void
  onStreamingUpdate: (text: string) => void
  onStatusChange: (status: string) => void
  onProcessingChange: (isProcessing: boolean) => void
}

// ============================================================================
// Constants
// ============================================================================

export const PLANNING_LEVELS: readonly PlanningLevelOption[] = [
  { value: 'Light spark', label: 'Light spark', description: 'Just a vague idea' },
  { value: 'Some notes', label: 'Some notes', description: 'Have some thoughts written down' },
  { value: 'Well defined', label: 'Well defined', description: 'Pretty clear on what I want' },
] as const

// Human-readable labels for discovery topics
export const TOPIC_LABELS: Record<DiscoveryTopic, string> = {
  elevator_pitch: 'What',
  problem_statement: 'Why',
  target_users: 'Who',
  value_proposition: 'Value',
  scope_and_antigoals: 'Scope',
  constraints: 'Constraints',
}

// Re-export for convenience
export { DISCOVERY_TOPICS }
export type { DiscoveryTopic }

// ============================================================================
// Interview Flow Controller
// ============================================================================

export class InterviewFlowController {
  private sessionManager: ISessionManager | null = null
  private currentSession: SessionState | null = null
  private phase: InterviewPhase = 'setup'
  private selectedPlanningLevel: PlanningLevel = 'Light spark'
  private isLaunching = false
  private isProcessing = false
  private events: InterviewFlowEvents

  constructor(
    private settings: LachesisSettings,
    private vault: Vault,
    events: InterviewFlowEvents
  ) {
    this.events = events
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  initialize(): void {
    const config: SessionManagerConfig = {
      settings: this.settings,
      vault: this.vault,
    }
    this.sessionManager = createSessionManager(config)
  }

  dispose(): void {
    this.sessionManager = null
    this.currentSession = null
  }

  // ============================================================================
  // State Getters
  // ============================================================================

  getPhase(): InterviewPhase {
    return this.phase
  }

  getSession(): SessionState | null {
    return this.currentSession
  }

  getSelectedPlanningLevel(): PlanningLevel {
    return this.selectedPlanningLevel
  }

  isCurrentlyProcessing(): boolean {
    return this.isProcessing
  }

  isCurrentlyLaunching(): boolean {
    return this.isLaunching
  }

  getCoveredTopics(): string[] {
    return this.currentSession?.coveredTopics || []
  }

  // ============================================================================
  // State Setters
  // ============================================================================

  setPlanningLevel(level: PlanningLevel): void {
    this.selectedPlanningLevel = level
  }

  // ============================================================================
  // Phase Transitions
  // ============================================================================

  private setPhase(phase: InterviewPhase, error?: string): void {
    this.phase = phase
    this.events.onPhaseChange(phase, error)
  }

  private setProcessing(processing: boolean): void {
    this.isProcessing = processing
    this.events.onProcessingChange(processing)
  }

  private updateStatus(status: string): void {
    this.events.onStatusChange(status)
  }

  private updateSession(session: SessionState): void {
    this.currentSession = session
    this.events.onSessionUpdate(session)
  }

  // ============================================================================
  // Interview Actions
  // ============================================================================

  async startInterview(): Promise<void> {
    if (!this.sessionManager || this.isLaunching || this.phase !== 'setup') return

    this.isLaunching = true
    this.setPhase('conversation')

    try {
      const session = await this.sessionManager.createSession({
        type: 'new_project',
        planningLevel: this.selectedPlanningLevel,
      })
      this.updateSession(session)

      await this.streamNextQuestion()
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to start interview'
      this.setPhase('error', error)
    } finally {
      this.isLaunching = false
    }
  }

  async startQuickStart(): Promise<void> {
    if (!this.sessionManager || this.isLaunching || this.phase !== 'setup') return

    this.isLaunching = true
    this.setPhase('naming')
    this.updateStatus('Creating session...')

    try {
      const session = await this.sessionManager.createSession({
        type: 'new_project',
        planningLevel: 'Quick Start',
      })
      this.updateSession(session)

      this.updateStatus('Getting name suggestions...')
      const updatedSession = await this.sessionManager.requestNameSuggestions(session.id)
      this.updateSession(updatedSession)
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to start quick project'
      this.setPhase('error', error)
    } finally {
      this.isLaunching = false
    }
  }

  async handleUserMessage(message: string): Promise<void> {
    if (!this.sessionManager || !this.currentSession || !message.trim()) return
    if (this.isProcessing) return

    try {
      const session = await this.sessionManager.sendMessage(
        this.currentSession.id,
        message,
      )
      this.updateSession(session)

      await this.streamNextQuestion()
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to send message'
      this.updateStatus(`Error: ${error}`)
      this.setProcessing(false)
    }
  }

  async handleSkipTopic(): Promise<void> {
    if (!this.sessionManager || !this.currentSession) return
    if (this.isProcessing) return

    this.setProcessing(true)

    try {
      const session = await this.sessionManager.sendMessage(
        this.currentSession.id,
        "I don't know yet, let's move on to the next topic",
      )
      this.updateSession(session)

      await this.streamNextQuestion()
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to skip topic'
      this.updateStatus(`Error: ${error}`)
      this.setProcessing(false)
    }
  }

  async selectProjectName(name: string): Promise<void> {
    if (!this.sessionManager || !this.currentSession) return

    this.updateStatus('Selecting name...')

    try {
      let session = await this.sessionManager.selectProjectName(
        this.currentSession.id,
        name,
      )
      this.updateSession(session)

      this.updateStatus('Extracting project data...')
      session = await this.sessionManager.extractProjectData(session.id)
      this.updateSession(session)

      this.updateStatus('Creating project files...')
      const result = await this.sessionManager.scaffold(session.id)

      if (result.success) {
        const finalSession = this.sessionManager.getSession(session.id)
        if (finalSession) {
          this.updateSession(finalSession)
        }
        this.setPhase('complete')
      } else {
        throw new Error(result.error || 'Failed to create project')
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to create project'
      this.setPhase('error', error)
    }
  }

  // ============================================================================
  // Internal Helpers
  // ============================================================================

  private async streamNextQuestion(): Promise<void> {
    if (!this.sessionManager || !this.currentSession) return

    this.setProcessing(true)
    this.updateStatus('Lachesis is thinking...')

    try {
      const session = await this.sessionManager.streamNextQuestion(
        this.currentSession.id,
        (partial) => {
          this.events.onStreamingUpdate(partial)
        },
      )
      this.updateSession(session)

      // Check if we should transition to naming
      if (this.shouldTransitionToNaming()) {
        await this.transitionToNaming()
      } else {
        this.setProcessing(false)
        this.updateStatus('Your turn')
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to generate question'
      this.updateStatus(`Error: ${error}`)
      this.setProcessing(false)
    }
  }

  private shouldTransitionToNaming(): boolean {
    if (!this.currentSession) return false

    const lastMessage = this.currentSession.messages[this.currentSession.messages.length - 1]
    if (lastMessage?.role === 'assistant') {
      const content = lastMessage.content.toLowerCase()
      return content.includes('very well, sir. let us proceed')
    }

    return false
  }

  private async transitionToNaming(): Promise<void> {
    if (!this.sessionManager || !this.currentSession) return

    this.updateStatus('Generating name suggestions...')

    try {
      const session = await this.sessionManager.requestNameSuggestions(
        this.currentSession.id,
      )
      this.updateSession(session)
      this.setPhase('naming')
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to generate names'
      this.updateStatus(`Error: ${error}`)
      // Fall back to naming phase with empty suggestions
      this.setPhase('naming')
    }
  }

  // ============================================================================
  // Reset
  // ============================================================================

  resetToSetup(): void {
    this.currentSession = null
    this.isLaunching = false
    this.isProcessing = false
    this.setPhase('setup')
  }
}
