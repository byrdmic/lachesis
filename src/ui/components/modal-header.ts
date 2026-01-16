// Modal Header Component
// Displays project name, status badge, and header controls

import type { App } from 'obsidian'
import type { ProjectSnapshot } from '../../core/project/snapshot'
import { HeaderControls, type HeaderControlsCallbacks, type HeaderControlsSettings } from './header-controls'
import type { IssuesPanel } from './issues-panel'

// ============================================================================
// Types
// ============================================================================

export type ModalHeaderCallbacks = HeaderControlsCallbacks & {
  /** Called when status badge is clicked (to show issues dropdown) */
  onStatusBadgeClick: (badgeEl: HTMLElement) => void
}

// ============================================================================
// Modal Header Component
// ============================================================================

export class ModalHeader {
  private app: App
  private projectPath: string
  private snapshot: ProjectSnapshot
  private callbacks: ModalHeaderCallbacks
  private settings: HeaderControlsSettings

  // Sub-components
  private headerControls: HeaderControls

  // DOM Elements
  private containerEl: HTMLElement | null = null
  private statusBadgeEl: HTMLElement | null = null

  constructor(
    app: App,
    projectPath: string,
    snapshot: ProjectSnapshot,
    callbacks: ModalHeaderCallbacks,
    settings: HeaderControlsSettings,
  ) {
    this.app = app
    this.projectPath = projectPath
    this.snapshot = snapshot
    this.callbacks = callbacks
    this.settings = settings

    // Initialize header controls
    this.headerControls = new HeaderControls(app, projectPath, callbacks, settings)
  }

  /**
   * Update the snapshot (e.g., after file changes).
   */
  setSnapshot(snapshot: ProjectSnapshot): void {
    this.snapshot = snapshot
    this.updateStatusBadge()
  }

  /**
   * Update settings.
   */
  updateSettings(settings: HeaderControlsSettings): void {
    this.settings = settings
    this.headerControls.updateSettings(settings)
  }

  /**
   * Get the status badge element (for positioning dropdowns).
   */
  getStatusBadgeEl(): HTMLElement | null {
    return this.statusBadgeEl
  }

  /**
   * Render the header into the provided container.
   */
  render(container: HTMLElement): void {
    this.containerEl = container
    container.empty()
    container.addClass('lachesis-header')

    // Project name
    container.createEl('h2', { text: this.snapshot.projectName })

    // Status badge
    const isReady = this.snapshot.readiness.isReady
    this.statusBadgeEl = container.createEl('span', {
      cls: `lachesis-status-badge ${isReady ? 'ready' : 'needs-work'} ${!isReady ? 'clickable' : ''}`,
    })
    this.statusBadgeEl.setText(isReady ? 'Ready' : 'Needs attention')

    // Add click handler for issues dropdown (only when not ready)
    if (!isReady) {
      this.statusBadgeEl.addEventListener('click', (e) => {
        e.stopPropagation()
        if (this.statusBadgeEl) {
          this.callbacks.onStatusBadgeClick(this.statusBadgeEl)
        }
      })
    }

    // Header controls container
    const controlsContainer = container.createDiv({ cls: 'lachesis-header-controls' })
    this.headerControls.render(controlsContainer)
  }

  /**
   * Update the status badge based on current snapshot.
   */
  updateStatusBadge(): void {
    if (!this.statusBadgeEl) return

    const isReady = this.snapshot.readiness.isReady

    // Update classes
    this.statusBadgeEl.removeClass('ready', 'needs-work', 'clickable')
    this.statusBadgeEl.addClass(isReady ? 'ready' : 'needs-work')
    if (!isReady) {
      this.statusBadgeEl.addClass('clickable')
    }

    // Update text
    this.statusBadgeEl.setText(isReady ? 'Ready' : 'Needs attention')
  }
}
