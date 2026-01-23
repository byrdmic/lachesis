// Issues Panel Component
// Manages the issues dropdown and fix actions for project health

import * as fs from 'fs'
import * as path from 'path'
import type { App, TFile } from 'obsidian'
import { Notice } from 'obsidian'
import type { ProjectSnapshot, ExpectedCoreFile } from '../../core/project/snapshot'
import type { ProjectStatus, ParsedMilestone } from '../../core/project/status'
import { TEMPLATES, type TemplateName } from '../../scaffolder/templates'
import { processTemplateForFile } from '../../scaffolder/scaffolder'
import {
  fixOverviewHeadings,
  fixRoadmapHeadings,
} from '../../core/project/template-evaluator'
import {
  type ProjectIssue,
  type IssuesPanelCallbacks,
  type FixActionFactory,
  ISSUE_ICONS,
  formatIssuesHeader,
  buildIssuesFromSnapshot,
  buildMilestoneTransitionIssues,
} from '../../core/project/issues'

// Re-export types for backward compatibility
export type { ProjectIssue, IssuesPanelCallbacks } from '../../core/project/issues'

// ============================================================================
// Issues Panel Component
// ============================================================================

export class IssuesPanel {
  private app: App
  private projectPath: string
  private snapshot: ProjectSnapshot
  private projectStatus: ProjectStatus | null = null
  private callbacks: IssuesPanelCallbacks
  private modalEl: HTMLElement

  // State
  private issuesDropdown: HTMLElement | null = null
  private isDropdownOpen = false

  constructor(
    app: App,
    projectPath: string,
    snapshot: ProjectSnapshot,
    callbacks: IssuesPanelCallbacks,
    modalEl: HTMLElement,
    projectStatus?: ProjectStatus
  ) {
    this.app = app
    this.projectPath = projectPath
    this.snapshot = snapshot
    this.projectStatus = projectStatus ?? null
    this.callbacks = callbacks
    this.modalEl = modalEl
  }

  /**
   * Update the snapshot reference.
   */
  setSnapshot(snapshot: ProjectSnapshot): void {
    this.snapshot = snapshot
  }

  /**
   * Update the project status reference.
   */
  setProjectStatus(status: ProjectStatus): void {
    this.projectStatus = status
  }

  /**
   * Clean up resources.
   */
  cleanup(): void {
    this.closeDropdown()
  }

  /**
   * Toggle the issues dropdown visibility.
   */
  toggleDropdown(anchorEl: HTMLElement): void {
    if (this.isDropdownOpen) {
      this.closeDropdown()
    } else {
      this.openDropdown(anchorEl)
    }
  }

  /**
   * Build the list of issues from the snapshot readiness data.
   */
  buildIssuesList(): ProjectIssue[] {
    const basePath = (this.app.vault.adapter as any).getBasePath() as string
    const fixFactory = this.createFixActionFactory()

    // Build standard issues from snapshot
    const issues = buildIssuesFromSnapshot(this.snapshot, basePath, fixFactory)

    // Add milestone transition issues if we have project status
    if (this.projectStatus) {
      const milestoneIssues = buildMilestoneTransitionIssues(
        this.projectStatus.transitionState,
        fixFactory
      )
      // Prepend milestone issues so they appear at the top
      issues.unshift(...milestoneIssues)
    }

    return issues
  }

  /**
   * Open the issues dropdown below the anchor element.
   */
  private openDropdown(anchorEl: HTMLElement): void {
    if (this.issuesDropdown) {
      this.closeDropdown()
    }

    const issues = this.buildIssuesList()
    if (issues.length === 0) return

    // Create dropdown container
    this.issuesDropdown = document.createElement('div')
    this.issuesDropdown.addClass('lachesis-issues-dropdown')

    // Position relative to anchor
    const rect = anchorEl.getBoundingClientRect()
    this.issuesDropdown.style.top = `${rect.bottom + 8}px`
    this.issuesDropdown.style.right = `${window.innerWidth - rect.right}px`

    // Header
    const header = this.issuesDropdown.createDiv({ cls: 'lachesis-issues-header' })
    header.setText(formatIssuesHeader(issues.length))

    // Issues list
    const listEl = this.issuesDropdown.createDiv({ cls: 'lachesis-issues-list' })

    for (const issue of issues) {
      this.renderIssueItem(listEl, issue)
    }

    // Add to modal
    this.modalEl.appendChild(this.issuesDropdown)
    this.isDropdownOpen = true

    // Close on outside click (delayed to prevent immediate close)
    setTimeout(() => {
      document.addEventListener('click', this.handleOutsideClick)
    }, 0)
  }

  /**
   * Close the issues dropdown.
   */
  closeDropdown(): void {
    if (this.issuesDropdown) {
      this.issuesDropdown.remove()
      this.issuesDropdown = null
    }
    this.isDropdownOpen = false
    document.removeEventListener('click', this.handleOutsideClick)
  }

  /**
   * Handle clicks outside the dropdown.
   */
  private handleOutsideClick = (e: MouseEvent): void => {
    if (this.issuesDropdown && !this.issuesDropdown.contains(e.target as Node)) {
      this.closeDropdown()
    }
  }

  /**
   * Render a single issue item in the dropdown.
   */
  private renderIssueItem(container: HTMLElement, issue: ProjectIssue): void {
    const itemEl = container.createDiv({ cls: `lachesis-issue-item lachesis-issue-${issue.type}` })

    // Icon based on type
    const iconEl = itemEl.createSpan({ cls: 'lachesis-issue-icon' })
    iconEl.setText(ISSUE_ICONS[issue.type])

    // Issue content
    const contentEl = itemEl.createDiv({ cls: 'lachesis-issue-content' })
    contentEl.createDiv({ cls: 'lachesis-issue-file', text: issue.file })
    contentEl.createDiv({ cls: 'lachesis-issue-message', text: issue.message })

    // Details (e.g., list of missing headings)
    if (issue.details) {
      contentEl.createDiv({ cls: 'lachesis-issue-details', text: issue.details })
    }

    // Button container for multiple actions
    const buttonContainer = itemEl.createDiv({ cls: 'lachesis-issue-buttons' })

    // Primary fix button
    const fixBtn = buttonContainer.createEl('button', {
      text: issue.fixLabel,
      cls: 'lachesis-issue-fix-btn',
    })
    fixBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      fixBtn.disabled = true
      fixBtn.setText('Working...')
      await issue.fixAction()
    })

    // Secondary fix button (if available)
    if (issue.secondaryFixLabel && issue.secondaryFixAction) {
      const secondaryBtn = buttonContainer.createEl('button', {
        text: issue.secondaryFixLabel,
        cls: 'lachesis-issue-fix-btn lachesis-issue-fix-btn-secondary',
      })
      secondaryBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        secondaryBtn.disabled = true
        secondaryBtn.setText('Working...')
        await issue.secondaryFixAction!()
      })
    }
  }

  /**
   * Update the status badge based on current snapshot.
   */
  updateStatusBadge(): void {
    const badge = this.modalEl.querySelector('.lachesis-status-badge')
    if (badge) {
      badge.removeClass('ready', 'needs-work', 'clickable')
      badge.addClass(this.snapshot.readiness.isReady ? 'ready' : 'needs-work')
      if (!this.snapshot.readiness.isReady) {
        badge.addClass('clickable')
      }
      badge.setText(this.snapshot.readiness.isReady ? 'Ready' : 'Needs attention')
    }
  }

  /**
   * Refresh snapshot and UI after a fix is applied.
   */
  private async refreshAfterFix(): Promise<void> {
    // Rebuild snapshot
    this.snapshot = await this.callbacks.onSnapshotRefresh()

    // Update badge
    this.updateStatusBadge()

    // Refresh dropdown if still open
    if (this.isDropdownOpen && this.issuesDropdown) {
      const anchorEl = this.modalEl.querySelector('.lachesis-status-badge') as HTMLElement
      if (anchorEl) {
        this.closeDropdown()
        if (!this.snapshot.readiness.isReady) {
          this.openDropdown(anchorEl)
        }
      }
    }
  }

  // ============================================================================
  // Fix Action Factory
  // ============================================================================

  /**
   * Create the fix action factory for building issues.
   */
  private createFixActionFactory(): FixActionFactory {
    return {
      createMissingFileFix: (fileName) => () => this.fixMissingFile(fileName),
      createTemplateOnlyFix: (fileName) => () => this.fixTemplateOnlyFile(fileName),
      createThinFileFix: (fileName) => () => this.fixThinFile(fileName),
      createConfigFix: () => () => this.fixMissingConfig(),
      createHeadingsAIFix: (fileName, missingHeadings) => () =>
        this.addMissingHeadingsWithAI(fileName, missingHeadings),
      createHeadingsReformatFix: (fileName) => () =>
        fileName === 'Overview.md' ? this.fixInvalidHeadings() : this.fixRoadmapInvalidHeadings(),
      createPlanNextMilestoneFix: (nextMilestone) => () =>
        this.startPlanNextMilestone(nextMilestone),
      createReviewTasksFix: (incompleteTasks) => () =>
        this.openReviewTasksChat(incompleteTasks),
      createCelebrateFix: () => () =>
        this.celebrateAllComplete(),
    }
  }

  // ============================================================================
  // Fix Action Methods
  // ============================================================================

  /**
   * Map file names to template names.
   */
  private getTemplateName(fileName: ExpectedCoreFile): TemplateName {
    const mapping: Record<ExpectedCoreFile, TemplateName> = {
      'Overview.md': 'overview',
      'Roadmap.md': 'roadmap',
      'Tasks.md': 'tasks',
      'Log.md': 'log',
      'Ideas.md': 'ideas',
      'Archive.md': 'archive',
    }
    return mapping[fileName]
  }

  /**
   * Fix a missing file by creating it from template.
   */
  private async fixMissingFile(fileName: ExpectedCoreFile): Promise<void> {
    try {
      const templateName = this.getTemplateName(fileName)
      const template = TEMPLATES[templateName]
      const filePath = `${this.projectPath}/${fileName}`

      // Process template with basic data
      const projectSlug = this.snapshot.projectName.toLowerCase().replace(/\s+/g, '-')
      const content = processTemplateForFile(template, {
        projectName: this.snapshot.projectName,
        projectSlug,
      })

      await this.app.vault.create(filePath, content)
      new Notice(`Created ${fileName}`)

      await this.refreshAfterFix()
    } catch (err) {
      new Notice(`Failed to create ${fileName}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Fix a template-only file by initiating an AI chat focused on filling it.
   */
  private async fixTemplateOnlyFile(fileName: ExpectedCoreFile): Promise<void> {
    this.closeDropdown()
    this.callbacks.onStartAIChat(
      `Help me fill in ${fileName}. It currently only has template placeholders. Let's work through it section by section.`,
      fileName
    )
  }

  /**
   * Fix a thin file by initiating an AI chat to expand it.
   */
  private async fixThinFile(fileName: ExpectedCoreFile): Promise<void> {
    this.closeDropdown()
    this.callbacks.onStartAIChat(
      `Help me expand ${fileName}. It has some content but needs more detail. Let's review what's there and add more.`,
      fileName
    )
  }

  /**
   * Add missing headings to a file using AI to propose targeted diffs.
   */
  private async addMissingHeadingsWithAI(
    fileName: ExpectedCoreFile,
    missingHeadings: string[]
  ): Promise<void> {
    this.closeDropdown()

    // Format the missing headings list for the AI
    const headingsList = missingHeadings.map((h) => `- ${h}`).join('\n')

    this.callbacks.onStartAIChat(
      `${fileName} is missing the following headings:\n\n${headingsList}\n\nPlease propose a diff to add ONLY these missing headings with appropriate placeholder content. Do not modify existing content\u2014just add the missing sections in the correct locations.`,
      fileName
    )
  }

  /**
   * Fix Overview.md headings by adding missing sections with placeholders.
   */
  private async fixInvalidHeadings(): Promise<void> {
    const confirmed = window.confirm(
      'This will reformat Overview.md to match the expected template structure.\n\n' +
        'Your existing content will be preserved where possible, but the file structure will change.\n\n' +
        'Continue?'
    )
    if (!confirmed) return

    try {
      const overviewPath = `${this.projectPath}/Overview.md`
      const overviewFile = this.app.vault.getAbstractFileByPath(overviewPath)

      if (!overviewFile || !(overviewFile instanceof (await import('obsidian')).TFile)) {
        new Notice('Overview.md not found')
        return
      }

      const content = await this.app.vault.read(overviewFile as TFile)
      const fixedContent = fixOverviewHeadings(content, this.snapshot.projectName)

      await this.app.vault.modify(overviewFile as TFile, fixedContent)
      new Notice('Reformatted Overview.md')

      await this.refreshAfterFix()
    } catch (err) {
      new Notice(`Failed to reformat: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Fix Roadmap.md headings by adding missing sections with placeholders.
   */
  private async fixRoadmapInvalidHeadings(): Promise<void> {
    const confirmed = window.confirm(
      'This will reformat Roadmap.md to match the expected template structure.\n\n' +
        'Your existing content will be preserved where possible, but the file structure will change.\n\n' +
        'Continue?'
    )
    if (!confirmed) return

    try {
      const roadmapPath = `${this.projectPath}/Roadmap.md`
      const roadmapFile = this.app.vault.getAbstractFileByPath(roadmapPath)

      if (!roadmapFile || !(roadmapFile instanceof (await import('obsidian')).TFile)) {
        new Notice('Roadmap.md not found')
        return
      }

      const content = await this.app.vault.read(roadmapFile as TFile)
      const fixedContent = fixRoadmapHeadings(content, this.snapshot.projectName)

      await this.app.vault.modify(roadmapFile as TFile, fixedContent)
      new Notice('Reformatted Roadmap.md')

      await this.refreshAfterFix()
    } catch (err) {
      new Notice(`Failed to reformat Roadmap: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Fix missing or incomplete .ai/config.json.
   */
  private async fixMissingConfig(): Promise<void> {
    this.closeDropdown()

    try {
      const configFolderPath = `${this.projectPath}/.ai`
      const configFilePath = `${configFolderPath}/config.json`

      // Check if config file already exists
      const basePath = (this.app.vault.adapter as any).getBasePath() as string
      const fullConfigPath = path.join(basePath, configFilePath)
      const configExists = fs.existsSync(fullConfigPath)

      if (configExists) {
        // Config exists but needs github_repo configured
        this.callbacks.onStartAIChat(
          'Help me configure my .ai/config.json - I need to set up the GitHub repository.'
        )
        return
      }

      // Config doesn't exist - need to create it first
      const fullFolderPath = path.join(basePath, configFolderPath)
      if (!fs.existsSync(fullFolderPath)) {
        try {
          await this.app.vault.createFolder(configFolderPath)
        } catch {
          fs.mkdirSync(fullFolderPath, { recursive: true })
        }
      }

      // Create new config file with empty github_repo
      const aiConfig = {
        $schema: 'https://lachesis.dev/schemas/ai-config.json',
        github_repo: '',
        notes:
          'Add your GitHub repo URL (e.g., "github.com/user/repo") to enable commit analysis for task tracking.',
      }

      try {
        await this.app.vault.create(configFilePath, JSON.stringify(aiConfig, null, 2))
      } catch {
        fs.writeFileSync(fullConfigPath, JSON.stringify(aiConfig, null, 2), 'utf-8')
      }

      new Notice('Created .ai/config.json')

      await this.refreshAfterFix()

      this.callbacks.onStartAIChat(
        'Help me configure my .ai/config.json - I need to set up the GitHub repository.'
      )
    } catch (err) {
      new Notice(`Failed to create config: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // ============================================================================
  // Milestone Transition Fix Actions
  // ============================================================================

  /**
   * Start a chat to plan the next milestone.
   */
  private async startPlanNextMilestone(nextMilestone: ParsedMilestone | null): Promise<void> {
    this.closeDropdown()

    if (nextMilestone) {
      this.callbacks.onStartAIChat(
        `I've completed the current milestone and I'm ready to plan the next phase: ${nextMilestone.id} "${nextMilestone.title}". Help me break this down into actionable tasks and vertical slices.`,
        'Roadmap.md'
      )
    } else {
      this.callbacks.onStartAIChat(
        `I've completed the current milestone and there are no more planned milestones. Help me think about what's next for this project - should we define new milestones, or is this project wrapping up?`,
        'Roadmap.md'
      )
    }
  }

  /**
   * Start a chat to review remaining tasks when milestone is marked done.
   */
  private async openReviewTasksChat(incompleteTasks: number): Promise<void> {
    this.closeDropdown()

    this.callbacks.onStartAIChat(
      `The current milestone is marked as done, but there are still ${incompleteTasks} incomplete task${incompleteTasks > 1 ? 's' : ''} in the Current section. Help me review these tasks - should they be moved to the next milestone, archived, or completed first?`,
      'Tasks.md'
    )
  }

  /**
   * Handle the celebration when all milestones are complete.
   */
  private async celebrateAllComplete(): Promise<void> {
    this.closeDropdown()

    this.callbacks.onStartAIChat(
      `All milestones are complete! Let's celebrate this achievement and reflect on what we've accomplished. Can you help me summarize what was built and suggest any next steps - perhaps documenting lessons learned or archiving the project?`,
      'Archive.md'
    )
  }
}
