// Header Controls Component
// Contains the auto-apply toggle and edit config button

import type { App } from 'obsidian'
import { ConfigEditorModal } from '../config-editor-modal'

// ============================================================================
// Types
// ============================================================================

export type HeaderControlsCallbacks = {
  /** Called when auto-apply setting changes */
  onAutoApplyChange: (enabled: boolean) => Promise<void>
  /** Called when config is saved and snapshot needs refresh */
  onConfigSaved: () => Promise<void>
}

export type HeaderControlsSettings = {
  /** Current auto-apply setting value */
  autoAcceptChanges: boolean
}

// ============================================================================
// Header Controls Component
// ============================================================================

export class HeaderControls {
  private app: App
  private projectPath: string
  private callbacks: HeaderControlsCallbacks
  private settings: HeaderControlsSettings

  // DOM Elements
  private containerEl: HTMLElement | null = null
  private checkboxEl: HTMLInputElement | null = null

  constructor(
    app: App,
    projectPath: string,
    callbacks: HeaderControlsCallbacks,
    settings: HeaderControlsSettings,
  ) {
    this.app = app
    this.projectPath = projectPath
    this.callbacks = callbacks
    this.settings = settings
  }

  /**
   * Update settings (e.g., when they change externally).
   */
  updateSettings(settings: HeaderControlsSettings): void {
    this.settings = settings
    if (this.checkboxEl) {
      this.checkboxEl.checked = settings.autoAcceptChanges
    }
  }

  /**
   * Render the controls into the provided container.
   */
  render(container: HTMLElement): void {
    this.containerEl = container
    container.empty()

    this.renderAutoApplyToggle(container)
    this.renderEditConfigButton(container)
  }

  /**
   * Render the auto-apply toggle switch.
   */
  private renderAutoApplyToggle(container: HTMLElement): void {
    const toggleContainer = container.createDiv({ cls: 'lachesis-auto-apply-toggle' })

    const label = toggleContainer.createEl('label', { cls: 'lachesis-toggle-label' })

    this.checkboxEl = label.createEl('input', { type: 'checkbox' })
    this.checkboxEl.checked = this.settings.autoAcceptChanges

    label.createSpan({ cls: 'lachesis-toggle-slider' })

    label.createSpan({
      text: 'Auto-apply',
      cls: 'lachesis-toggle-text',
    })

    this.checkboxEl.addEventListener('change', async () => {
      if (this.checkboxEl) {
        await this.callbacks.onAutoApplyChange(this.checkboxEl.checked)
      }
    })
  }

  /**
   * Render the edit config button.
   */
  private renderEditConfigButton(container: HTMLElement): void {
    const button = container.createEl('button', {
      text: 'Edit Config',
      cls: 'lachesis-edit-config-button',
    })

    button.addEventListener('click', () => {
      const modal = new ConfigEditorModal(this.app, this.projectPath, async (saved) => {
        if (saved) {
          await this.callbacks.onConfigSaved()
        }
      })
      modal.open()
    })
  }
}
