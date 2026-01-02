// Project Picker Modal - Lists and selects existing projects

import { App, Modal, Notice, TFolder } from 'obsidian'
import type LachesisPlugin from '../main'
import { buildProjectSnapshot, formatProjectSnapshotForModel } from '../core/project/snapshot-builder'
import type { ProjectSnapshot } from '../core/project/snapshot'

// ============================================================================
// Types
// ============================================================================

type ProjectInfo = {
  name: string
  path: string
  snapshot?: ProjectSnapshot
}

// ============================================================================
// Project Picker Modal
// ============================================================================

export class ProjectPickerModal extends Modal {
  private plugin: LachesisPlugin
  private projects: ProjectInfo[] = []
  private isLoading = true
  private onSelect: (projectPath: string, snapshot: ProjectSnapshot) => void

  constructor(
    app: App,
    plugin: LachesisPlugin,
    onSelect: (projectPath: string, snapshot: ProjectSnapshot) => void,
  ) {
    super(app)
    this.plugin = plugin
    this.onSelect = onSelect
  }

  async onOpen() {
    const { contentEl } = this
    contentEl.empty()
    // Style hook: Obsidian sizes modals via the root `.modal` element
    this.modalEl.addClass('lachesis-modal-root')
    contentEl.addClass('lachesis-modal')

    this.renderLoading()
    await this.loadProjects()
    this.renderProjects()
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
  }

  private renderLoading() {
    const { contentEl } = this
    contentEl.empty()

    contentEl.createEl('h2', { text: 'Select Project' })
    contentEl.createEl('p', {
      text: 'Loading projects...',
      cls: 'lachesis-loading',
    })
  }

  private async loadProjects() {
    const projectsFolder = this.plugin.settings.projectsFolder

    // Get the projects folder
    const folder = this.app.vault.getAbstractFileByPath(projectsFolder)
    if (!folder || !(folder instanceof TFolder)) {
      this.projects = []
      this.isLoading = false
      return
    }

    // List subfolders (each is a project)
    const projectFolders = folder.children.filter(
      (child): child is TFolder => child instanceof TFolder
    )

    // Build snapshots for each project
    this.projects = await Promise.all(
      projectFolders.map(async (pf) => {
        const snapshot = await buildProjectSnapshot(this.app.vault, pf.path)
        return {
          name: pf.name,
          path: pf.path,
          snapshot,
        }
      })
    )

    // Sort by most recently modified (based on any file's mtime)
    this.projects.sort((a, b) => {
      const aTime = this.getLatestMtime(a.snapshot)
      const bTime = this.getLatestMtime(b.snapshot)
      return bTime - aTime
    })

    this.isLoading = false
  }

  private getLatestMtime(snapshot?: ProjectSnapshot): number {
    if (!snapshot) return 0
    let latest = 0
    for (const file of Object.values(snapshot.files)) {
      if (file.modifiedAt) {
        const mtime = new Date(file.modifiedAt).getTime()
        if (mtime > latest) latest = mtime
      }
    }
    return latest
  }

  private renderProjects() {
    const { contentEl } = this
    contentEl.empty()

    // Header
    contentEl.createEl('h2', { text: 'Select Project' })

    if (this.projects.length === 0) {
      const emptyEl = contentEl.createDiv({ cls: 'lachesis-empty-state' })
      emptyEl.createEl('p', {
        text: 'No projects found.',
      })
      emptyEl.createEl('p', {
        text: `Create a new project or check your projects folder: ${this.plugin.settings.projectsFolder}`,
        cls: 'lachesis-muted',
      })

      const buttonContainer = contentEl.createDiv({ cls: 'lachesis-button-container' })
      const newButton = buttonContainer.createEl('button', {
        text: 'New Project',
        cls: 'mod-cta',
      })
      newButton.addEventListener('click', () => {
        this.close()
        // The main plugin will handle opening the interview modal
        this.plugin.openNewProjectInterview()
      })
      return
    }

    // Project list
    const listContainer = contentEl.createDiv({ cls: 'lachesis-project-list' })

    for (const project of this.projects) {
      const projectEl = listContainer.createDiv({ cls: 'lachesis-project-item' })

      // Project info
      const infoEl = projectEl.createDiv({ cls: 'lachesis-project-info' })
      infoEl.createEl('div', { text: project.name, cls: 'lachesis-project-name' })

      // Status badge
      if (project.snapshot) {
        const statusCls = project.snapshot.readiness.isReady ? 'ready' : 'needs-work'
        const statusText = project.snapshot.readiness.isReady ? 'Ready' : 'Needs attention'
        infoEl.createEl('span', {
          text: statusText,
          cls: `lachesis-project-status ${statusCls}`,
        })
      }

      // Health summary
      if (project.snapshot) {
        const healthEl = projectEl.createDiv({ cls: 'lachesis-project-health' })
        const missing = project.snapshot.health.missingFiles.length
        const weak = project.snapshot.health.thinOrTemplateFiles.length

        if (missing > 0 || weak > 0) {
          const parts: string[] = []
          if (missing > 0) parts.push(`${missing} missing`)
          if (weak > 0) parts.push(`${weak} need filling`)
          healthEl.setText(parts.join(', '))
        } else {
          healthEl.setText('All files filled')
        }
      }

      // Click handler
      projectEl.addEventListener('click', () => {
        if (project.snapshot) {
          this.onSelect(project.path, project.snapshot)
          this.close()
        }
      })
    }

    // Footer with New Project button
    const footerEl = contentEl.createDiv({ cls: 'lachesis-modal-footer' })
    const newButton = footerEl.createEl('button', {
      text: 'New Project',
    })
    newButton.addEventListener('click', () => {
      this.close()
      this.plugin.openNewProjectInterview()
    })
  }
}
