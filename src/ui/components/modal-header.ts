// Modal Header Component
// Displays project name, status badge, and header controls

import type { App } from 'obsidian'
import type { ProjectSnapshot } from '../../core/project/snapshot'
import type { ProjectStatus } from '../../core/project/status'
import { HeaderControls, type HeaderControlsCallbacks, type HeaderControlsSettings } from './header-controls'
import { ProjectStatusIndicator } from './project-status-indicator'

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
  private projectStatus: ProjectStatus | null = null
  private callbacks: ModalHeaderCallbacks
  private settings: HeaderControlsSettings

  // Sub-components
  private headerControls: HeaderControls
  private statusIndicator: ProjectStatusIndicator

  // DOM Elements
  private containerEl: HTMLElement | null = null
  private statusBadgeEl: HTMLElement | null = null

  constructor(
    app: App,
    projectPath: string,
    snapshot: ProjectSnapshot,
    callbacks: ModalHeaderCallbacks,
    settings: HeaderControlsSettings,
    projectStatus?: ProjectStatus
  ) {
    this.app = app
    this.projectPath = projectPath
    this.snapshot = snapshot
    this.projectStatus = projectStatus ?? null
    this.callbacks = callbacks
    this.settings = settings

    // Initialize header controls
    this.headerControls = new HeaderControls(app, projectPath, callbacks, settings)

    // Initialize status indicator
    this.statusIndicator = new ProjectStatusIndicator()
  }

  /**
   * Update the snapshot (e.g., after file changes).
   */
  setSnapshot(snapshot: ProjectSnapshot): void {
    this.snapshot = snapshot
    this.updateStatusBadge()
    this.statusIndicator.setStatus(snapshot.status ?? null)
  }

  /**
   * Update the project status (for milestone transitions).
   */
  setProjectStatus(status: ProjectStatus): void {
    this.projectStatus = status
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
   * Get the badge state based on snapshot readiness and project status.
   */
  private getBadgeState(): {
    text: string
    classes: string[]
    clickable: boolean
  } {
    // Check for milestone transitions first (they take priority)
    if (this.projectStatus) {
      const transition = this.projectStatus.transitionState

      if (transition.status === 'all_complete') {
        return {
          text: 'All Complete',
          classes: ['all-complete', 'clickable'],
          clickable: true,
        }
      }

      if (transition.status === 'milestone_complete') {
        if (transition.hasIncompleteTasks) {
          return {
            text: 'Review Needed',
            classes: ['review-needed', 'clickable'],
            clickable: true,
          }
        } else {
          return {
            text: 'Milestone Complete',
            classes: ['milestone-complete', 'clickable'],
            clickable: true,
          }
        }
      }
    }

    // Fall back to standard readiness states
    const isReady = this.snapshot.readiness.isReady
    if (isReady) {
      return {
        text: 'Ready',
        classes: ['ready'],
        clickable: false,
      }
    } else {
      return {
        text: 'Needs attention',
        classes: ['needs-work', 'clickable'],
        clickable: true,
      }
    }
  }

  /**
   * Render the header into the provided container.
   */
  render(container: HTMLElement): void {
    this.containerEl = container
    container.empty()
    container.addClass('lachesis-header')

    // Left section: project name + status badge
    const leftSection = container.createDiv({ cls: 'lachesis-header-left' })

    // Project name
    leftSection.createEl('h2', { text: this.snapshot.projectName })

    // Status badge
    const badgeState = this.getBadgeState()
    this.statusBadgeEl = leftSection.createEl('span', {
      cls: `lachesis-status-badge ${badgeState.classes.join(' ')}`,
    })
    this.statusBadgeEl.setText(badgeState.text)

    // Add click handler for issues dropdown (when clickable)
    if (badgeState.clickable) {
      this.statusBadgeEl.addEventListener('click', (e) => {
        e.stopPropagation()
        if (this.statusBadgeEl) {
          this.callbacks.onStatusBadgeClick(this.statusBadgeEl)
        }
      })
    }

    // Center: Project status indicator (milestone, tasks, slice)
    console.log('[ModalHeader] Rendering status indicator, snapshot.status:', this.snapshot.status)
    const statusContainer = container.createDiv({ cls: 'lachesis-project-status' })
    this.statusIndicator.setStatus(this.snapshot.status ?? null)
    this.statusIndicator.render(statusContainer)

    // Right: Header controls
    const controlsContainer = container.createDiv({ cls: 'lachesis-header-controls' })
    this.headerControls.render(controlsContainer)
  }

  /**
   * Update the status badge based on current snapshot.
   */
  updateStatusBadge(): void {
    if (!this.statusBadgeEl) return

    const badgeState = this.getBadgeState()

    // Update classes - remove all possible states first
    this.statusBadgeEl.removeClass(
      'ready',
      'needs-work',
      'clickable',
      'milestone-complete',
      'review-needed',
      'all-complete'
    )
    // Add the new classes
    for (const cls of badgeState.classes) {
      this.statusBadgeEl.addClass(cls)
    }

    // Update text
    this.statusBadgeEl.setText(badgeState.text)
  }
}
