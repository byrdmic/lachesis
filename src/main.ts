import { Plugin, TFolder } from 'obsidian'
import { LachesisSettingTab, DEFAULT_SETTINGS, type LachesisSettings } from './settings'
import { InterviewModal } from './ui/interview-modal'
import { ProjectPickerModal } from './ui/project-picker-modal'
import { ExistingProjectModal } from './ui/existing-project-modal'
import type { ProjectSnapshot } from './core/project/snapshot'
import { buildProjectSnapshot } from './core/project/snapshot-builder'

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
    const activeProjectPath = this.getActiveProjectPath()

    if (activeProjectPath) {
      // Active file is in a project - go directly to existing project modal
      const snapshot = await buildProjectSnapshot(this.app.vault, activeProjectPath)
      this.openExistingProject(activeProjectPath, snapshot)
    } else {
      // No active project - show picker
      this.openProjectPicker()
    }
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
   */
  openProjectPicker() {
    new ProjectPickerModal(this.app, this, (projectPath, snapshot) => {
      this.openExistingProject(projectPath, snapshot)
    }).open()
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
}
