/**
 * Workflow Hint Banner Component
 * Displays contextual hints after workflow completion, suggesting the next logical workflow.
 */

import type { WorkflowHint } from '../../core/workflows/hints'

// ============================================================================
// Types
// ============================================================================

export type WorkflowHintCallbacks = {
  onRunWorkflow: (workflowDisplayName: string) => void
  onDismiss: () => void
}

// ============================================================================
// Component
// ============================================================================

export class WorkflowHintBanner {
  private containerEl: HTMLElement | null = null
  private callbacks: WorkflowHintCallbacks

  constructor(callbacks: WorkflowHintCallbacks) {
    this.callbacks = callbacks
  }

  /**
   * Render the hint banner into the parent element.
   */
  render(parentEl: HTMLElement, hint: WorkflowHint): void {
    this.remove()

    this.containerEl = parentEl.createDiv({ cls: 'lachesis-hint-banner' })

    // Message
    this.containerEl.createSpan({ cls: 'lachesis-hint-message', text: hint.message })

    // Action button
    if (hint.actionLabel && hint.suggestedWorkflow) {
      const actionBtn = this.containerEl.createEl('button', {
        cls: 'lachesis-hint-action',
        text: hint.actionLabel,
      })
      actionBtn.addEventListener('click', () => {
        this.callbacks.onRunWorkflow(hint.actionLabel!)
        this.remove()
      })
    }

    // Dismiss button
    const dismissBtn = this.containerEl.createEl('button', {
      cls: 'lachesis-hint-dismiss',
      attr: { 'aria-label': 'Dismiss' },
    })
    dismissBtn.textContent = '\u00d7'
    dismissBtn.addEventListener('click', () => {
      this.callbacks.onDismiss()
      this.remove()
    })
  }

  /**
   * Remove the hint banner from the DOM.
   */
  remove(): void {
    this.containerEl?.remove()
    this.containerEl = null
  }
}
