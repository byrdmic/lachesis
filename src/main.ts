import { Plugin } from 'obsidian'
import { LachesisSettingTab, DEFAULT_SETTINGS, type LachesisSettings } from './settings'
import { InterviewModal } from './ui/interview-modal'
import { ProjectPickerModal } from './ui/project-picker-modal'
import { ExistingProjectModal } from './ui/existing-project-modal'
import type { ProjectSnapshot } from './core/project/snapshot'

// ============================================================================
// Main Plugin
// ============================================================================

export default class LachesisPlugin extends Plugin {
  settings: LachesisSettings = DEFAULT_SETTINGS

  async onload() {
    await this.loadSettings()

    // Add ribbon icon - opens project picker
    this.addRibbonIcon('brain-circuit', 'Lachesis: Projects', () => {
      this.openProjectPicker()
    })

    // Add commands
    this.addCommand({
      id: 'open-project-picker',
      name: 'Open project picker',
      callback: () => {
        this.openProjectPicker()
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
