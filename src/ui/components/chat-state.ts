// Chat State and Controller Utilities
// Types, state management, and helper functions for chat interface

// ============================================================================
// Types
// ============================================================================

export type ChatInterfaceCallbacks = {
  /** Called when user submits input */
  onSubmit: (message: string) => void
  /** Called when user clicks "View Enrichments" for an enrich-tasks response */
  onViewEnrichTasks: (content: string) => void
  /** Called when user clicks "View Tasks" for a plan-work response */
  onViewPlanWork: (content: string) => void
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
  private _isProcessing = false
  private _activeWorkflowName: string | null = null
  private _isViewingLoadedChat = false
  private _planningMode = false

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

  // Planning mode
  get planningMode(): boolean {
    return this._planningMode
  }

  setPlanningMode(enabled: boolean): void {
    this._planningMode = enabled
  }

  /**
   * Reset all state to initial values.
   */
  reset(): void {
    this._streamingText = ''
    this._isProcessing = false
    this._activeWorkflowName = null
    this._isViewingLoadedChat = false
    this._planningMode = false
  }
}
