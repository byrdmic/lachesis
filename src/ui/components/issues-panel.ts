// Issues Panel Component
// Manages the issues dropdown and fix actions for project health

import * as fs from 'fs'
import * as path from 'path'
import type { App, TFile } from 'obsidian'
import { Notice } from 'obsidian'
import type { ProjectSnapshot, ExpectedCoreFile } from '../../core/project/snapshot'
import { buildProjectSnapshot } from '../../core/project/snapshot-builder'
import { TEMPLATES, type TemplateName } from '../../scaffolder/templates'
import { processTemplateForFile } from '../../scaffolder/scaffolder'
import {
  validateOverviewHeadings,
  fixOverviewHeadings,
  validateRoadmapHeadings,
  fixRoadmapHeadings,
} from '../../core/project/template-evaluator'

// ============================================================================
// Types
// ============================================================================

export type ProjectIssue = {
  file: ExpectedCoreFile | '.ai/config.json'
  type: 'missing' | 'template_only' | 'thin' | 'config' | 'headings_invalid'
  message: string
  /** Additional details shown below the message (e.g., list of missing headings) */
  details?: string
  fixLabel: string
  fixAction: () => Promise<void>
  /** Optional secondary fix action */
  secondaryFixLabel?: string
  secondaryFixAction?: () => Promise<void>
}

export type IssuesPanelCallbacks = {
  /** Called when an issue needs AI assistance (triggers chat input) */
  onStartAIChat: (message: string, focusedFile?: ExpectedCoreFile) => void
  /** Called after a fix is applied to refresh the snapshot */
  onSnapshotRefresh: () => Promise<ProjectSnapshot>
}

// ============================================================================
// Issues Panel Component
// ============================================================================

export class IssuesPanel {
  private app: App
  private projectPath: string
  private snapshot: ProjectSnapshot
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
  ) {
    this.app = app
    this.projectPath = projectPath
    this.snapshot = snapshot
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
    const issues: ProjectIssue[] = []

    // Check for config issues first (higher priority)
    if (this.snapshot.health.configIssues.length > 0) {
      const configMissing = !this.snapshot.aiConfig
      issues.push({
        file: '.ai/config.json',
        type: 'config',
        message: configMissing
          ? 'AI config file is missing'
          : 'GitHub repository not configured',
        fixLabel: configMissing ? 'Create Config' : 'Configure',
        fixAction: () => this.fixMissingConfig(),
      })
    }

    for (const fileName of this.snapshot.readiness.prioritizedFiles) {
      const fileEntry = this.snapshot.files[fileName]

      if (!fileEntry.exists) {
        issues.push({
          file: fileName,
          type: 'missing',
          message: `${fileName} does not exist`,
          fixLabel: 'Create File',
          fixAction: () => this.fixMissingFile(fileName),
        })
      } else if (fileEntry.templateStatus === 'template_only') {
        issues.push({
          file: fileName,
          type: 'template_only',
          message: `${fileName} has not been filled in`,
          fixLabel: 'Fill with AI',
          fixAction: () => this.fixTemplateOnlyFile(fileName),
        })
      } else if (fileEntry.templateStatus === 'thin') {
        issues.push({
          file: fileName,
          type: 'thin',
          message: `${fileName} needs more content`,
          fixLabel: 'Expand with AI',
          fixAction: () => this.fixThinFile(fileName),
        })
      }
    }

    // Check Overview.md headings validation (only if file exists and isn't already flagged as missing/template_only)
    const overviewEntry = this.snapshot.files['Overview.md']
    if (overviewEntry?.exists && overviewEntry.templateStatus !== 'missing') {
      // Don't duplicate if Overview.md is already in issues as template_only
      const alreadyHasOverviewIssue = issues.some(
        (i) => i.file === 'Overview.md' && (i.type === 'missing' || i.type === 'template_only')
      )
      if (!alreadyHasOverviewIssue) {
        const headingIssue = this.checkOverviewHeadingsSync()
        if (headingIssue) {
          issues.push(headingIssue)
        }
      }
    }

    // Check Roadmap.md headings validation (only if file exists and isn't already flagged as missing/template_only)
    const roadmapEntry = this.snapshot.files['Roadmap.md']
    if (roadmapEntry?.exists && roadmapEntry.templateStatus !== 'missing') {
      // Don't duplicate if Roadmap.md is already in issues as template_only
      const alreadyHasRoadmapIssue = issues.some(
        (i) => i.file === 'Roadmap.md' && (i.type === 'missing' || i.type === 'template_only')
      )
      if (!alreadyHasRoadmapIssue) {
        const headingIssue = this.checkRoadmapHeadingsSync()
        if (headingIssue) {
          issues.push(headingIssue)
        }
      }
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
    header.setText(`${issues.length} issue${issues.length > 1 ? 's' : ''} to address`)

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
    const iconMap: Record<ProjectIssue['type'], string> = {
      missing: '!',
      template_only: '?',
      thin: '~',
      config: '\u2699', // ⚙
      headings_invalid: '\u2630', // ☰
    }
    iconEl.setText(iconMap[issue.type])

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
  // Headings Validation
  // ============================================================================

  /**
   * Synchronously check Overview.md heading validation using filesystem.
   * Returns an issue if headings are invalid, null otherwise.
   */
  private checkOverviewHeadingsSync(): ProjectIssue | null {
    try {
      const basePath = (this.app.vault.adapter as any).getBasePath() as string
      const overviewPath = path.join(basePath, this.projectPath, 'Overview.md')

      if (!fs.existsSync(overviewPath)) return null

      const content = fs.readFileSync(overviewPath, 'utf-8')
      const validation = validateOverviewHeadings(content)

      if (!validation.isValid) {
        // Format the missing headings as a readable list
        const missingList = validation.missingHeadings
          .map((h) => h.replace(/^##+ /, '')) // Remove markdown heading markers for display
          .join(', ')

        return {
          file: 'Overview.md',
          type: 'headings_invalid',
          message: `Missing ${validation.missingHeadings.length} heading(s)`,
          details: `Missing: ${missingList}`,
          fixLabel: 'Add Missing (AI)',
          fixAction: () => this.addMissingHeadingsWithAI('Overview.md', validation.missingHeadings),
          secondaryFixLabel: 'Reformat File',
          secondaryFixAction: () => this.fixInvalidHeadings(),
        }
      }

      return null
    } catch (err) {
      console.warn('Failed to validate Overview.md headings:', err)
      return null
    }
  }

  /**
   * Synchronously check Roadmap.md heading validation using filesystem.
   * Returns an issue if headings are invalid, null otherwise.
   */
  private checkRoadmapHeadingsSync(): ProjectIssue | null {
    try {
      const basePath = (this.app.vault.adapter as any).getBasePath() as string
      const roadmapPath = path.join(basePath, this.projectPath, 'Roadmap.md')

      if (!fs.existsSync(roadmapPath)) return null

      const content = fs.readFileSync(roadmapPath, 'utf-8')
      const validation = validateRoadmapHeadings(content)

      if (!validation.isValid) {
        // Format the missing headings as a readable list
        const missingList = validation.missingHeadings
          .map((h) => h.replace(/^##+ /, '')) // Remove markdown heading markers for display
          .join(', ')

        return {
          file: 'Roadmap.md',
          type: 'headings_invalid',
          message: `Missing ${validation.missingHeadings.length} heading(s)`,
          details: `Missing: ${missingList}`,
          fixLabel: 'Add Missing (AI)',
          fixAction: () => this.addMissingHeadingsWithAI('Roadmap.md', validation.missingHeadings),
          secondaryFixLabel: 'Reformat File',
          secondaryFixAction: () => this.fixRoadmapInvalidHeadings(),
        }
      }

      return null
    } catch (err) {
      console.warn('Failed to validate Roadmap.md headings:', err)
      return null
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
   * This allows the user to review and accept/reject each proposed change.
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
   * This is a structural fix that doesn't require AI.
   * WARNING: This reformats the entire file structure.
   */
  private async fixInvalidHeadings(): Promise<void> {
    // Confirm with user since this reformats the file
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
   * This is a structural fix that doesn't require AI.
   * WARNING: This reformats the entire file structure.
   */
  private async fixRoadmapInvalidHeadings(): Promise<void> {
    // Confirm with user since this reformats the file
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
   * - If config doesn't exist: create it and ask AI for help
   * - If config exists but github_repo is empty: ask AI to help configure it
   */
  private async fixMissingConfig(): Promise<void> {
    this.closeDropdown()

    try {
      const configFolderPath = `${this.projectPath}/.ai`
      const configFilePath = `${configFolderPath}/config.json`

      // Check if config file already exists (use filesystem directly for reliability)
      const basePath = (this.app.vault.adapter as any).getBasePath() as string
      const fullConfigPath = path.join(basePath, configFilePath)
      const configExists = fs.existsSync(fullConfigPath)

      if (configExists) {
        // Config exists but needs github_repo configured
        // Start a conversation with the AI to help configure it
        this.callbacks.onStartAIChat(
          'Help me configure my .ai/config.json - I need to set up the GitHub repository.'
        )
        return
      }

      // Config doesn't exist - need to create it first
      // Ensure .ai folder exists
      const fullFolderPath = path.join(basePath, configFolderPath)
      if (!fs.existsSync(fullFolderPath)) {
        // Try vault API first, fall back to fs
        try {
          await this.app.vault.createFolder(configFolderPath)
        } catch {
          // Vault API failed, try fs directly
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

      // Try vault API first, fall back to fs
      try {
        await this.app.vault.create(configFilePath, JSON.stringify(aiConfig, null, 2))
      } catch {
        // Vault API failed, write directly
        fs.writeFileSync(fullConfigPath, JSON.stringify(aiConfig, null, 2), 'utf-8')
      }

      new Notice('Created .ai/config.json')

      // Refresh to update the snapshot
      await this.refreshAfterFix()

      // Now start a conversation with the AI to configure it
      this.callbacks.onStartAIChat(
        'Help me configure my .ai/config.json - I need to set up the GitHub repository.'
      )
    } catch (err) {
      new Notice(`Failed to create config: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }
}
