// Project Status Indicator Component
// Displays current milestone, task completion, and active slice at-a-glance

import type { ProjectStatus } from '../../core/project/status'

// ============================================================================
// Types
// ============================================================================

type StatusSegment = {
  icon: string
  text: string
  cls?: string
}

// ============================================================================
// Project Status Indicator Component
// ============================================================================

export class ProjectStatusIndicator {
  private status: ProjectStatus | null = null
  private containerEl: HTMLElement | null = null

  /**
   * Update the project status data.
   */
  setStatus(status: ProjectStatus | null): void {
    console.log('[ProjectStatusIndicator] setStatus called:', status)
    this.status = status
    if (this.containerEl) {
      this.renderContent()
    }
  }

  /**
   * Render the status indicator into the provided container.
   */
  render(container: HTMLElement): void {
    this.containerEl = container
    container.empty()
    container.addClass('lachesis-project-status')
    this.renderContent()
  }

  /**
   * Render the content based on current status.
   */
  private renderContent(): void {
    if (!this.containerEl) return
    this.containerEl.empty()

    const segments = this.buildSegments()
    console.log('[ProjectStatusIndicator] renderContent - segments:', segments)

    if (segments.length === 0) {
      return
    }

    segments.forEach((segment, index) => {
      // Add separator between segments
      if (index > 0) {
        this.containerEl!.createSpan({
          cls: 'lachesis-status-separator',
          text: '|',
        })
      }

      const segmentEl = this.containerEl!.createSpan({
        cls: `lachesis-status-segment ${segment.cls ?? ''}`.trim(),
      })

      segmentEl.createSpan({
        cls: 'lachesis-status-icon',
        text: segment.icon,
      })

      segmentEl.createSpan({
        cls: 'lachesis-status-text',
        text: segment.text,
      })
    })
  }

  /**
   * Build the status segments based on current status.
   */
  private buildSegments(): StatusSegment[] {
    const segments: StatusSegment[] = []

    if (!this.status) {
      return segments
    }

    // Milestone segment
    const milestoneSegment = this.buildMilestoneSegment()
    if (milestoneSegment) {
      segments.push(milestoneSegment)
    }

    // Task segment
    const taskSegment = this.buildTaskSegment()
    if (taskSegment) {
      segments.push(taskSegment)
    }

    // Active slice segment
    const sliceSegment = this.buildSliceSegment()
    if (sliceSegment) {
      segments.push(sliceSegment)
    }

    return segments
  }

  /**
   * Build the milestone segment.
   */
  private buildMilestoneSegment(): StatusSegment | null {
    if (!this.status) return null

    // No milestones defined at all
    if (this.status.allMilestones.length === 0) {
      return {
        icon: '\u25cb', // Empty circle
        text: 'No milestones',
        cls: 'lachesis-status-muted',
      }
    }

    // No active milestone
    if (!this.status.currentMilestone) {
      return {
        icon: '\u25cb', // Empty circle
        text: 'No active milestone',
        cls: 'lachesis-status-muted',
      }
    }

    const milestone = this.status.currentMilestone
    const displayText = `${milestone.id}: ${milestone.title}`

    // Determine icon and style based on status
    let icon = '\u25c9' // Default filled circle
    let cls = 'lachesis-status-active'

    if (milestone.status === 'done') {
      icon = '\u2713' // Checkmark
      cls = 'lachesis-status-success'
    } else if (milestone.status === 'blocked') {
      icon = '\u25a0' // Filled square
      cls = 'lachesis-status-warning'
    }

    return { icon, text: displayText, cls }
  }

  /**
   * Build the task segment.
   */
  private buildTaskSegment(): StatusSegment | null {
    if (!this.status) return null

    const { tasksCompleted, tasksTotal } = this.status

    // Hide task segment if zero tasks
    if (tasksTotal === 0) {
      return null
    }

    // All tasks complete
    if (tasksCompleted === tasksTotal) {
      return {
        icon: '\u2713', // Checkmark
        text: `${tasksCompleted}/${tasksTotal} tasks`,
        cls: 'lachesis-status-success',
      }
    }

    // Milestone done but tasks remain - warning state
    let cls = ''
    if (this.status.currentMilestone?.status === 'done' && tasksCompleted < tasksTotal) {
      cls = 'lachesis-status-warning'
    }

    return {
      icon: '\u2610', // Empty checkbox
      text: `${tasksCompleted}/${tasksTotal} tasks`,
      cls,
    }
  }

  /**
   * Build the active slice segment.
   */
  private buildSliceSegment(): StatusSegment | null {
    if (!this.status) return null

    // No active slice - omit segment entirely
    if (!this.status.activeSlice) {
      return null
    }

    const slice = this.status.activeSlice
    const displayText = `${slice.id}: ${slice.name}`

    return {
      icon: '\u25b8', // Right-pointing triangle
      text: displayText,
      cls: 'lachesis-status-active',
    }
  }
}
