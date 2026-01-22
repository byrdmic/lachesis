import { Plugin, TFolder, Menu, TFile, type Editor, type MarkdownView, type MarkdownFileInfo } from 'obsidian'
import { LachesisSettingTab, DEFAULT_SETTINGS, type LachesisSettings } from './settings'
import { InterviewModal } from './ui/interview-modal'
import { ProjectPickerModal } from './ui/project-picker-modal'
import { ExistingProjectModal } from './ui/existing-project-modal'
import { TitleEntryModal } from './ui/title-entry-modal'
import type { ProjectSnapshot } from './core/project/snapshot'
import { buildProjectSnapshot } from './core/project/snapshot-builder'
import { findLogEntryAtCursor, type LogEntryAtCursor } from './utils/log-entry-finder'

// ============================================================================
// Main Plugin
// ============================================================================

export default class LachesisPlugin extends Plugin {
  settings: LachesisSettings = DEFAULT_SETTINGS

  async onload() {
    await this.loadSettings()

    // Add ribbon icon - opens project picker or goes directly to active project
    this.addRibbonIcon('brain-circuit', 'Lachesis: Projects', () => {
      this.openLachesis()
    })

    // Add commands
    this.addCommand({
      id: 'open-project-picker',
      name: 'Open project picker',
      callback: () => {
        this.openLachesis()
      },
    })

    this.addCommand({
      id: 'new-project-interview',
      name: 'Start new project interview',
      callback: () => {
        this.openNewProjectInterview()
      },
    })

    // Add settings tab
    this.addSettingTab(new LachesisSettingTab(this.app, this))

    // Register context menu for Log.md entries
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor, info) => {
        this.handleLogEntryContextMenu(menu, editor, info)
      })
    )

    console.log('Lachesis plugin loaded')
  }

  onunload() {
    console.log('Lachesis plugin unloaded')
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }

  // ============================================================================
  // Modal Openers
  // ============================================================================

  /**
   * Main entry point - checks for active project file first
   */
  async openLachesis() {
    // 1. Try inference from active file
    const activeProjectPath = this.getActiveProjectPath()

    if (activeProjectPath) {
      // Active file is in a project - go directly to existing project modal
      const snapshot = await buildProjectSnapshot(this.app.vault, activeProjectPath)
      this.openExistingProject(activeProjectPath, snapshot)
      return
    }

    // 2. Check last-used project path
    const lastUsed = this.settings.lastActiveProjectPath
    if (lastUsed) {
      // Validate the path still exists as a folder
      const folder = this.app.vault.getAbstractFileByPath(lastUsed)
      if (folder && folder instanceof TFolder) {
        // Open picker with last-used project pre-selected
        this.openProjectPicker(lastUsed)
        return
      }
      // Clear invalid last-used path
      this.settings.lastActiveProjectPath = undefined
      await this.saveSettings()
    }

    // 3. No valid last-used - open picker normally
    this.openProjectPicker()
  }

  /**
   * Check if the active file is inside a project folder.
   * Returns the project path if found, null otherwise.
   */
  private getActiveProjectPath(): string | null {
    const activeFile = this.app.workspace.getActiveFile()
    if (!activeFile) return null

    const projectsFolder = this.settings.projectsFolder
    const filePath = activeFile.path

    // Check if file is inside the projects folder
    if (!filePath.startsWith(projectsFolder + '/')) return null

    // Extract the project folder (first subfolder after projects folder)
    // e.g., "Projects/My Project/Log.md" -> "Projects/My Project"
    const relativePath = filePath.slice(projectsFolder.length + 1)
    const projectName = relativePath.split('/')[0]
    if (!projectName) return null

    const projectPath = `${projectsFolder}/${projectName}`

    // Verify it's actually a folder
    const folder = this.app.vault.getAbstractFileByPath(projectPath)
    if (!folder || !(folder instanceof TFolder)) return null

    return projectPath
  }

  /**
   * Open the project picker modal
   * @param preSelectedPath - Optional project path to highlight/pre-select
   */
  openProjectPicker(preSelectedPath?: string) {
    new ProjectPickerModal(this.app, this, (projectPath, snapshot) => {
      this.openExistingProject(projectPath, snapshot)
    }, preSelectedPath).open()
  }

  /**
   * Open the new project interview modal
   */
  openNewProjectInterview() {
    new InterviewModal(this.app, this).open()
  }

  /**
   * Open an existing project for continuation
   */
  openExistingProject(projectPath: string, snapshot: ProjectSnapshot) {
    new ExistingProjectModal(this.app, this, projectPath, snapshot).open()
  }

  // ============================================================================
  // Context Menu Handlers
  // ============================================================================

  /**
   * Handle right-click context menu in the editor.
   * Adds "Title Current Entry" option when in Log.md on an unsummarized entry.
   */
  private handleLogEntryContextMenu(
    menu: Menu,
    editor: Editor,
    info: MarkdownView | MarkdownFileInfo
  ): void {
    // 1. Check if file is Log.md
    const file = info.file
    if (!file || file.name !== 'Log.md') return

    // 2. Check if file is in a project folder
    const projectPath = this.getProjectPathForFile(file)
    if (!projectPath) return

    // 3. Find entry at cursor
    const cursorLine = editor.getCursor().line
    const entryInfo = findLogEntryAtCursor(editor, cursorLine)

    // 4. Only show if entry exists and is unsummarized
    if (!entryInfo || entryInfo.entry.isSummarized) return

    // 5. Add menu item
    menu.addItem((item) => {
      item
        .setTitle('Title Current Entry')
        .setIcon('pencil')
        .onClick(() => {
          this.titleCurrentEntry(projectPath, file, editor, entryInfo)
        })
    })
  }

  /**
   * Get project path for a given file (if it's in a project folder).
   */
  private getProjectPathForFile(file: TFile): string | null {
    const projectsFolder = this.settings.projectsFolder
    const filePath = file.path

    // Check if file is inside the projects folder
    if (!filePath.startsWith(projectsFolder + '/')) return null

    // Extract the project folder (first subfolder after projects folder)
    const relativePath = filePath.slice(projectsFolder.length + 1)
    const projectName = relativePath.split('/')[0]
    if (!projectName) return null

    const projectPath = `${projectsFolder}/${projectName}`

    // Verify it's actually a folder
    const folder = this.app.vault.getAbstractFileByPath(projectPath)
    if (!folder || !(folder instanceof TFolder)) return null

    return projectPath
  }

  /**
   * Open the title entry modal and apply the title when confirmed.
   */
  private async titleCurrentEntry(
    projectPath: string,
    file: TFile,
    editor: Editor,
    entryInfo: LogEntryAtCursor
  ): Promise<void> {
    const snapshot = await buildProjectSnapshot(this.app.vault, projectPath)

    new TitleEntryModal(
      this.app,
      this,
      projectPath,
      snapshot,
      entryInfo,
      async (updatedTimeLine) => {
        // Apply the title to the specific line
        const line = entryInfo.entry.startLine
        editor.setLine(line, updatedTimeLine)
      }
    ).open()
  }
}
