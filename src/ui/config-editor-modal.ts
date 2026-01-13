/**
 * Config Editor Modal - Edit .ai/config.json for a project
 *
 * Opens a simple textarea modal to edit the project's AI configuration file.
 */

import { App, Modal, TextAreaComponent } from 'obsidian'
import * as fs from 'fs'
import * as path from 'path'

export type ConfigEditorCallback = (saved: boolean) => void

const DEFAULT_CONFIG = {
  $schema: 'https://lachesis.dev/schemas/ai-config.json',
  github_repo: '',
  notes:
    'Add your GitHub repo URL (e.g., "github.com/user/repo") to enable commit analysis for task tracking.',
}

export class ConfigEditorModal extends Modal {
  private configContent = ''
  private projectPath: string
  private onSave: ConfigEditorCallback
  private configPath: string

  constructor(app: App, projectPath: string, onSave: ConfigEditorCallback) {
    super(app)
    this.projectPath = projectPath
    this.onSave = onSave
    this.configPath = path.join(projectPath, '.ai', 'config.json')
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()
    this.modalEl.addClass('lachesis-config-editor-modal-root')
    contentEl.addClass('lachesis-config-editor-modal')

    // Header
    contentEl.createEl('h2', { text: 'Edit Project Config' })
    contentEl.createEl('p', {
      text: 'Edit the .ai/config.json file for this project. This file stores project-specific settings like the GitHub repository URL.',
      cls: 'lachesis-config-editor-subtitle',
    })

    // Load existing config or create default
    this.loadConfig()

    // Textarea
    const textareaWrapper = contentEl.createDiv({ cls: 'lachesis-config-editor-textarea-wrapper' })
    const textarea = new TextAreaComponent(textareaWrapper)
    textarea.inputEl.addClass('lachesis-config-editor-textarea')
    textarea.inputEl.rows = 12
    textarea.setValue(this.configContent)
    textarea.onChange((value) => {
      this.configContent = value
    })

    // Footer
    const footer = contentEl.createDiv({ cls: 'lachesis-config-editor-footer' })

    const cancelBtn = footer.createEl('button', {
      text: 'Cancel',
      cls: 'lachesis-config-editor-cancel-btn',
    })
    cancelBtn.addEventListener('click', () => {
      this.onSave(false)
      this.close()
    })

    const saveBtn = footer.createEl('button', {
      text: 'Save',
      cls: 'lachesis-config-editor-save-btn mod-cta',
    })
    saveBtn.addEventListener('click', () => {
      this.saveConfig()
    })

    // Focus the textarea
    setTimeout(() => textarea.inputEl.focus(), 50)
  }

  private loadConfig(): void {
    try {
      // Ensure .ai directory exists
      const aiDir = path.join(this.projectPath, '.ai')
      if (!fs.existsSync(aiDir)) {
        fs.mkdirSync(aiDir, { recursive: true })
      }

      if (fs.existsSync(this.configPath)) {
        this.configContent = fs.readFileSync(this.configPath, 'utf-8')
      } else {
        // Create default config
        this.configContent = JSON.stringify(DEFAULT_CONFIG, null, 2)
      }
    } catch {
      // If we can't read, use default
      this.configContent = JSON.stringify(DEFAULT_CONFIG, null, 2)
    }
  }

  private saveConfig(): void {
    try {
      // Validate JSON before saving
      JSON.parse(this.configContent)

      // Ensure .ai directory exists
      const aiDir = path.join(this.projectPath, '.ai')
      if (!fs.existsSync(aiDir)) {
        fs.mkdirSync(aiDir, { recursive: true })
      }

      fs.writeFileSync(this.configPath, this.configContent, 'utf-8')
      this.onSave(true)
      this.close()
    } catch (e) {
      // Invalid JSON - show error
      const errorEl = this.contentEl.querySelector('.lachesis-config-editor-error')
      if (errorEl) {
        errorEl.setText('Invalid JSON. Please fix the syntax and try again.')
      } else {
        const footer = this.contentEl.querySelector('.lachesis-config-editor-footer')
        if (footer) {
          const error = footer.createEl('p', {
            text: 'Invalid JSON. Please fix the syntax and try again.',
            cls: 'lachesis-config-editor-error',
          })
          footer.insertBefore(error, footer.firstChild)
        }
      }
    }
  }

  onClose() {
    this.contentEl.empty()
  }
}
