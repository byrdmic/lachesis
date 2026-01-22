// Chat State and Controller Utilities
// Types, state management, and helper functions for chat interface

import type { DiffBlock } from '../../utils/diff'

// ============================================================================
// Types
// ============================================================================

export type ChatInterfaceCallbacks = {
  /** Called when user submits input */
  onSubmit: (message: string) => void
  /** Called when a diff is accepted or rejected */
  onDiffAction: (diffBlock: DiffBlock, action: 'accepted' | 'rejected') => void
  /** Called when user clicks "View Enrichments" for an enrich-tasks response */
  onViewEnrichTasks: (content: string) => void
  /** Called when user clicks "View Tasks" for a plan-work response */
  onViewPlanWork: (content: string) => void
  /** Called to check if auto-accept is enabled */
  isAutoAcceptEnabled: () => boolean
  /** Called to check if a specific workflow has auto-apply enabled */
  getWorkflowAutoApply?: (workflowName: string) => boolean
}

// ============================================================================
// Chat State Class
// ============================================================================

/**
 * Manages the state for the chat interface.
 * Separates state management from view rendering.
 */
export class ChatState {
  private _streamingText = ''
  private _pendingDiffs: DiffBlock[] = []
  private _isProcessing = false
  private _activeWorkflowName: string | null = null
  private _isViewingLoadedChat = false

  // Streaming text
  get streamingText(): string {
    return this._streamingText
  }

  setStreamingText(text: string): void {
    this._streamingText = text
  }

  clearStreamingText(): void {
    this._streamingText = ''
  }

  // Pending diffs
  get pendingDiffs(): DiffBlock[] {
    return this._pendingDiffs
  }

  setPendingDiffs(diffs: DiffBlock[]): void {
    this._pendingDiffs = diffs
  }

  clearPendingDiffs(): void {
    this._pendingDiffs = []
  }

  // Processing state
  get isProcessing(): boolean {
    return this._isProcessing
  }

  setProcessing(processing: boolean): void {
    this._isProcessing = processing
  }

  // Active workflow
  get activeWorkflowName(): string | null {
    return this._activeWorkflowName
  }

  setActiveWorkflow(workflowName: string | null): void {
    this._activeWorkflowName = workflowName
  }

  // Viewing loaded chat
  get isViewingLoadedChat(): boolean {
    return this._isViewingLoadedChat
  }

  setViewingLoadedChat(viewing: boolean): void {
    this._isViewingLoadedChat = viewing
  }

  /**
   * Check if auto-apply should be enabled based on global and workflow-specific settings.
   */
  shouldAutoApply(callbacks: ChatInterfaceCallbacks): boolean {
    const globalAutoApply = callbacks.isAutoAcceptEnabled()
    const workflowAutoApply = this._activeWorkflowName && callbacks.getWorkflowAutoApply
      ? callbacks.getWorkflowAutoApply(this._activeWorkflowName)
      : true // If no workflow-specific callback, fall back to global setting
    return globalAutoApply && workflowAutoApply && !this._isViewingLoadedChat
  }

  /**
   * Reset all state to initial values.
   */
  reset(): void {
    this._streamingText = ''
    this._pendingDiffs = []
    this._isProcessing = false
    this._activeWorkflowName = null
    this._isViewingLoadedChat = false
  }
}
