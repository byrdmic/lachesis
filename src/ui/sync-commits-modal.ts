/**
 * Sync Commits Modal - Review and apply commit-to-task matches
 */

import { App, Modal } from 'obsidian'
import type {
  CommitMatch,
  UnmatchedCommit,
  SyncAction,
  SyncCommitSelection,
  ConfidenceLevel,
} from '../utils/sync-commits-parser'
import {
  SYNC_ACTION_LABELS,
  CONFIDENCE_BADGES,
  getDefaultAction,
  getTaskSectionLabel,
} from '../utils/sync-commits-parser'

// ============================================================================
// Types
// ============================================================================

export type SyncCommitsActionCallback = (
  selections: SyncCommitSelection[],
  confirmed: boolean,
) => Promise<void>

export interface SyncCommitsModalOptions {
  showUnmatched?: boolean // Whether to show unmatched commits section
  viewOnly?: boolean // Whether modal is in view-only mode (for history)
}

// ============================================================================
// Modal
// ============================================================================

export class SyncCommitsModal extends Modal {
  private matches: CommitMatch[]
  private unmatchedCommits: UnmatchedCommit[]
  private projectPath: string
  private onAction: SyncCommitsActionCallback
  private selections: Map<string, SyncCommitSelection> = new Map()
  private showUnmatched: boolean
  private viewOnly: boolean
  private expandedUnmatched: boolean = false

  constructor(
    app: App,
    matches: CommitMatch[],
    unmatchedCommits: UnmatchedCommit[],
    projectPath: string,
    onAction: SyncCommitsActionCallback,
    options: SyncCommitsModalOptions = {},
  ) {
    super(app)
    this.matches = matches
    this.unmatchedCommits = unmatchedCommits
    this.projectPath = projectPath
    this.onAction = onAction
    this.showUnmatched = options.showUnmatched ?? true
    this.viewOnly = options.viewOnly ?? false

    // Initialize selections with default actions based on confidence
    // For already completed tasks, default to 'skip'
    for (const match of matches) {
      this.selections.set(match.id, {
        matchId: match.id,
        action: match.alreadyCompleted ? 'skip' : getDefaultAction(match.confidence),
      })
    }
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()

    // Style hooks
    this.modalEl.addClass('lachesis-sync-commits-modal-root')
    contentEl.addClass('lachesis-sync-commits-modal')

    this.render()
  }

  private render() {
    const { contentEl } = this
    contentEl.empty()

    // Header
    this.renderHeader(contentEl)

    // Content area (scrollable)
    const content = contentEl.createDiv({ cls: 'lachesis-sync-commits-content' })

    // Matches section
    if (this.matches.length > 0) {
      this.renderMatchesSection(content)
    } else {
      content.createEl('p', {
        text: 'No commits matched any unchecked tasks.',
        cls: 'lachesis-no-matches-message',
      })
    }

    // Unmatched commits section (collapsible)
    if (this.showUnmatched && this.unmatchedCommits.length > 0) {
      this.renderUnmatchedSection(content)
    }

    // Footer with actions
    this.renderFooter(contentEl)
  }

  private renderHeader(container: HTMLElement) {
    const header = container.createDiv({ cls: 'lachesis-sync-commits-header' })

    header.createEl('h2', { text: 'Sync Commits to Tasks' })

    const stats = this.getStats()
    const pendingCount = this.matches.filter((m) => !m.alreadyCompleted).length
    const completedCount = this.matches.filter((m) => m.alreadyCompleted).length

    let subtitle = `Found ${stats.matchedCount} commit${stats.matchedCount === 1 ? '' : 's'} matching tasks`
    if (this.viewOnly && completedCount > 0) {
      subtitle += ` (${completedCount} already completed)`
    }
    header.createEl('p', {
      text: subtitle,
      cls: 'lachesis-sync-commits-subtitle',
    })

    if (stats.unmatchedCount > 0) {
      header.createEl('p', {
        text: `(${stats.unmatchedCount} commit${stats.unmatchedCount === 1 ? '' : 's'} did not match any task)`,
        cls: 'lachesis-sync-commits-note',
      })
    }

    // Confidence legend
    const legendEl = header.createDiv({ cls: 'lachesis-sync-commits-legend' })
    legendEl.createEl('span', { text: 'Confidence: ', cls: 'lachesis-legend-label' })

    for (const [level, badge] of Object.entries(CONFIDENCE_BADGES)) {
      const badgeEl = legendEl.createSpan({
        text: badge.label,
        cls: `lachesis-confidence-badge lachesis-confidence-${level}`,
      })
    }
  }

  private renderMatchesSection(container: HTMLElement) {
    const section = container.createDiv({ cls: 'lachesis-sync-commits-matches' })

    // In view-only mode, show pending tasks first, then completed
    if (this.viewOnly) {
      const pendingMatches = this.matches.filter((m) => !m.alreadyCompleted)
      const completedMatches = this.matches.filter((m) => m.alreadyCompleted)

      if (pendingMatches.length > 0) {
        const pendingGroup = section.createDiv({ cls: 'lachesis-sync-group' })
        pendingGroup.createEl('h3', {
          text: `Pending (${pendingMatches.length})`,
          cls: 'lachesis-sync-group-header',
        })
        for (const match of pendingMatches) {
          this.renderMatchItem(pendingGroup, match)
        }
      }

      if (completedMatches.length > 0) {
        const completedGroup = section.createDiv({ cls: 'lachesis-sync-group' })
        completedGroup.createEl('h3', {
          text: `Already Completed (${completedMatches.length})`,
          cls: 'lachesis-sync-group-header lachesis-sync-group-completed',
        })
        for (const match of completedMatches) {
          this.renderMatchItem(completedGroup, match)
        }
      }
    } else {
      for (const match of this.matches) {
        this.renderMatchItem(section, match)
      }
    }
  }

  private renderMatchItem(container: HTMLElement, match: CommitMatch) {
    const selection = this.selections.get(match.id)!
    const isCompleted = match.alreadyCompleted

    const itemEl = container.createDiv({
      cls: `lachesis-sync-commit-item ${isCompleted ? 'lachesis-sync-completed' : ''}`,
    })
    itemEl.dataset.matchId = match.id

    // Commit info row
    const commitRow = itemEl.createDiv({ cls: 'lachesis-sync-commit-row' })

    // Commit SHA and date
    const commitMeta = commitRow.createDiv({ cls: 'lachesis-sync-commit-meta' })

    if (match.commitUrl) {
      const shaLink = commitMeta.createEl('a', {
        text: match.commitShortSha,
        href: match.commitUrl,
        cls: 'lachesis-sync-commit-sha',
      })
      shaLink.setAttr('target', '_blank')
    } else {
      commitMeta.createEl('span', {
        text: match.commitShortSha,
        cls: 'lachesis-sync-commit-sha',
      })
    }

    if (match.commitDate) {
      const date = new Date(match.commitDate)
      commitMeta.createEl('span', {
        text: date.toLocaleDateString(),
        cls: 'lachesis-sync-commit-date',
      })
    }

    // Commit title
    commitRow.createEl('div', {
      text: match.commitTitle,
      cls: 'lachesis-sync-commit-title',
    })

    // Confidence badge
    const confidenceBadge = commitRow.createSpan({
      text: CONFIDENCE_BADGES[match.confidence].label,
      cls: `lachesis-confidence-badge lachesis-confidence-${match.confidence}`,
    })

    // Completed badge (if applicable)
    if (isCompleted) {
      commitRow.createSpan({
        text: 'Done',
        cls: 'lachesis-sync-completed-badge',
      })
    }

    // Task match row
    const taskRow = itemEl.createDiv({ cls: 'lachesis-sync-task-row' })

    taskRow.createEl('span', {
      text: 'Matches:',
      cls: 'lachesis-sync-matches-label',
    })

    const taskEl = taskRow.createDiv({ cls: 'lachesis-sync-task-info' })

    const taskTextEl = taskEl.createEl('span', {
      text: match.taskText,
      cls: `lachesis-sync-task-text ${isCompleted ? 'lachesis-sync-task-done' : ''}`,
    })

    taskEl.createEl('span', {
      text: `(${getTaskSectionLabel(match.taskSection)})`,
      cls: 'lachesis-sync-task-section',
    })

    // AI reasoning row
    if (match.reasoning) {
      const reasoningRow = itemEl.createDiv({ cls: 'lachesis-sync-reasoning-row' })
      reasoningRow.createEl('span', {
        text: `AI: ${match.reasoning}`,
        cls: 'lachesis-sync-reasoning',
      })
    }

    // Action dropdown row - only show for pending tasks (or non-viewOnly mode)
    if (!isCompleted || !this.viewOnly) {
      const controlsRow = itemEl.createDiv({ cls: 'lachesis-sync-controls' })
      this.renderActionDropdown(controlsRow, match, selection)
    }
  }

  private renderActionDropdown(
    container: HTMLElement,
    match: CommitMatch,
    selection: SyncCommitSelection,
  ) {
    const wrapper = container.createDiv({ cls: 'lachesis-sync-dropdown-wrapper' })
    wrapper.createEl('label', { text: 'Action:', cls: 'lachesis-sync-label' })

    const select = wrapper.createEl('select', { cls: 'lachesis-sync-dropdown' })

    const actions: SyncAction[] = ['mark-archive', 'mark-complete', 'skip']

    for (const action of actions) {
      const option = select.createEl('option', {
        text: SYNC_ACTION_LABELS[action],
        value: action,
      })
      if (action === selection.action) {
        option.selected = true
      }
    }

    select.addEventListener('change', () => {
      this.updateSelection(match.id, {
        ...selection,
        action: select.value as SyncAction,
      })
      this.render()
    })
  }

  private renderUnmatchedSection(container: HTMLElement) {
    const section = container.createDiv({ cls: 'lachesis-sync-unmatched-section' })

    // Collapsible header
    const headerEl = section.createDiv({ cls: 'lachesis-sync-unmatched-header' })

    const toggleIcon = headerEl.createSpan({
      text: this.expandedUnmatched ? '▼' : '▶',
      cls: 'lachesis-sync-toggle-icon',
    })

    headerEl.createEl('span', {
      text: `Unmatched Commits (${this.unmatchedCommits.length})`,
      cls: 'lachesis-sync-unmatched-title',
    })

    headerEl.addEventListener('click', () => {
      this.expandedUnmatched = !this.expandedUnmatched
      this.render()
    })

    // Content (if expanded)
    if (this.expandedUnmatched) {
      const contentEl = section.createDiv({ cls: 'lachesis-sync-unmatched-content' })

      for (const commit of this.unmatchedCommits) {
        const itemEl = contentEl.createDiv({ cls: 'lachesis-sync-unmatched-item' })

        // Commit info
        const metaEl = itemEl.createDiv({ cls: 'lachesis-sync-unmatched-meta' })
        metaEl.createEl('span', {
          text: commit.commitShortSha,
          cls: 'lachesis-sync-commit-sha',
        })
        if (commit.commitDate) {
          const date = new Date(commit.commitDate)
          metaEl.createEl('span', {
            text: date.toLocaleDateString(),
            cls: 'lachesis-sync-commit-date',
          })
        }

        itemEl.createEl('div', {
          text: commit.commitTitle,
          cls: 'lachesis-sync-unmatched-title',
        })

        itemEl.createEl('div', {
          text: commit.reasoning,
          cls: 'lachesis-sync-unmatched-reason',
        })
      }
    }
  }

  private renderFooter(container: HTMLElement) {
    const footer = container.createDiv({ cls: 'lachesis-sync-commits-footer' })

    // Stats summary
    const stats = this.getActionStats()
    const pendingCount = this.matches.filter((m) => !m.alreadyCompleted).length

    if (stats.archiveCount > 0 || stats.completeCount > 0 || stats.skipCount > 0) {
      const summaryEl = footer.createDiv({ cls: 'lachesis-sync-footer-summary' })
      const parts: string[] = []
      if (stats.archiveCount > 0) {
        parts.push(`${stats.archiveCount} to archive`)
      }
      if (stats.completeCount > 0) {
        parts.push(`${stats.completeCount} to mark complete`)
      }
      if (stats.skipCount > 0 && !this.viewOnly) {
        parts.push(`${stats.skipCount} to skip`)
      }
      if (parts.length > 0) {
        summaryEl.setText(parts.join(', '))
      }
    }

    // Buttons
    const buttonsEl = footer.createDiv({ cls: 'lachesis-sync-footer-buttons' })

    const cancelBtn = buttonsEl.createEl('button', {
      text: this.viewOnly ? 'Close' : 'Cancel',
      cls: 'lachesis-sync-cancel-btn',
    })
    cancelBtn.addEventListener('click', () => this.handleCancel())

    // Only show Apply button if there are pending actions
    const actionCount = stats.archiveCount + stats.completeCount
    if (actionCount > 0 || !this.viewOnly) {
      const confirmBtn = buttonsEl.createEl('button', {
        text: actionCount > 0 ? `Apply ${actionCount} Change${actionCount === 1 ? '' : 's'}` : 'Apply',
        cls: 'lachesis-sync-confirm-btn mod-cta',
      })
      confirmBtn.addEventListener('click', () => this.handleConfirm())

      // Disable if no actions to apply
      if (actionCount === 0) {
        confirmBtn.setAttr('disabled', 'true')
        confirmBtn.addClass('lachesis-btn-disabled')
      }
    }
  }

  private updateSelection(matchId: string, selection: SyncCommitSelection) {
    this.selections.set(matchId, selection)
  }

  private getStats() {
    return {
      matchedCount: this.matches.length,
      unmatchedCount: this.unmatchedCommits.length,
      totalCommits: this.matches.length + this.unmatchedCommits.length,
    }
  }

  private getActionStats() {
    let archiveCount = 0
    let completeCount = 0
    let skipCount = 0

    for (const [matchId, selection] of this.selections.entries()) {
      // Find the match to check if it's already completed
      const match = this.matches.find((m) => m.id === matchId)
      if (match?.alreadyCompleted) {
        // Don't count already completed tasks
        continue
      }

      switch (selection.action) {
        case 'mark-archive':
          archiveCount++
          break
        case 'mark-complete':
          completeCount++
          break
        case 'skip':
          skipCount++
          break
      }
    }

    return { archiveCount, completeCount, skipCount }
  }

  private async handleConfirm() {
    // Only include selections for non-completed tasks
    const selections = Array.from(this.selections.values()).filter((sel) => {
      const match = this.matches.find((m) => m.id === sel.matchId)
      return !match?.alreadyCompleted
    })
    await this.onAction(selections, true)
    this.close()
  }

  private async handleCancel() {
    await this.onAction([], false)
    this.close()
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
  }
}
