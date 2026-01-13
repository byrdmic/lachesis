import {
  App,
  Notice,
  PluginSettingTab,
  Setting,
  TFolder,
  AbstractInputSuggest,
} from 'obsidian'
import type LachesisPlugin from './main'
import type { ProviderType } from './ai/providers/types'
import { getAvailableProviders, getModelsForProvider, getDefaultModel, getProvider } from './ai/providers/factory'

// ============================================================================
// Settings Types
// ============================================================================

export interface LachesisSettings {
  // Provider selection
  provider: ProviderType

  // Anthropic settings
  anthropicApiKey: string
  anthropicModel: string

  // OpenAI settings
  openaiApiKey: string
  openaiModel: string

  // GitHub settings
  githubToken: string

  // Project settings
  projectsFolder: string

  // Behavior settings
  autoAcceptChanges: boolean
}

export const DEFAULT_SETTINGS: LachesisSettings = {
  provider: 'anthropic',
  anthropicApiKey: '',
  anthropicModel: 'claude-sonnet-4-20250514',
  openaiApiKey: '',
  openaiModel: 'gpt-5.2',
  githubToken: '',
  projectsFolder: 'Projects',
  autoAcceptChanges: false,
}

// ============================================================================
// Folder Suggester
// ============================================================================

class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(app: App, private inputEl: HTMLInputElement) {
    super(app, inputEl)
  }

  getSuggestions(inputStr: string): TFolder[] {
    const abstractFiles = this.app.vault.getAllLoadedFiles()
    const folders: TFolder[] = []
    const lowerInputStr = inputStr.toLowerCase()

    abstractFiles.forEach((file) => {
      if (
        file instanceof TFolder &&
        file.path.toLowerCase().includes(lowerInputStr)
      ) {
        folders.push(file)
      }
    })

    // Sort by path length (shorter paths first) then alphabetically
    return folders.sort((a, b) => {
      if (a.path.length !== b.path.length) {
        return a.path.length - b.path.length
      }
      return a.path.localeCompare(b.path)
    })
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path || '/')
  }

  selectSuggestion(folder: TFolder): void {
    this.inputEl.value = folder.path
    this.inputEl.trigger('input')
    this.close()
  }
}

// ============================================================================
// Settings Tab
// ============================================================================

export class LachesisSettingTab extends PluginSettingTab {
  plugin: LachesisPlugin

  constructor(app: App, plugin: LachesisPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this

    containerEl.empty()

    // Header
    containerEl.createEl('h2', { text: 'Lachesis Settings' })

    // Provider Selection
    containerEl.createEl('h3', { text: 'AI Provider' })

    const providers = getAvailableProviders()

    new Setting(containerEl)
      .setName('Provider')
      .setDesc('Select which AI provider to use for interviews')
      .addDropdown((dropdown) => {
        providers.forEach((p) => {
          dropdown.addOption(p.type, p.displayName)
        })
        dropdown
          .setValue(this.plugin.settings.provider)
          .onChange(async (value) => {
            this.plugin.settings.provider = value as ProviderType
            await this.plugin.saveSettings()
            // Refresh display to show provider-specific settings
            this.display()
          })
      })

    // Provider-specific settings
    const currentProvider = this.plugin.settings.provider

    if (currentProvider === 'anthropic') {
      this.displayAnthropicSettings(containerEl)
    } else if (currentProvider === 'openai') {
      this.displayOpenAISettings(containerEl)
    }

    // Test connection button
    this.displayConnectionTest(containerEl)

    // GitHub section
    this.displayGitHubSettings(containerEl)

    // Projects section
    containerEl.createEl('h3', { text: 'Project Settings' })

    // Projects folder with folder suggester
    const folderSetting = new Setting(containerEl)
      .setName('Projects Folder')
      .setDesc('Folder where new projects will be created. Type to search existing folders.')

    folderSetting.addText((text) => {
      text.inputEl.style.width = '300px'
      text
        .setPlaceholder('Projects')
        .setValue(this.plugin.settings.projectsFolder)
        .onChange(async (value) => {
          this.plugin.settings.projectsFolder = value
          await this.plugin.saveSettings()
        })

      // Add folder suggestions
      new FolderSuggest(this.app, text.inputEl)
    })

    // Create folder button
    folderSetting.addButton((button) =>
      button
        .setIcon('folder-plus')
        .setTooltip('Create folder if it doesn\'t exist')
        .onClick(async () => {
          const folderPath = this.plugin.settings.projectsFolder
          if (!folderPath) {
            new Notice('Please enter a folder path first')
            return
          }

          const existingFolder = this.app.vault.getAbstractFileByPath(folderPath)
          if (existingFolder) {
            new Notice(`Folder "${folderPath}" already exists`)
            return
          }

          try {
            await this.app.vault.createFolder(folderPath)
            new Notice(`Created folder: ${folderPath}`)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            new Notice(`Failed to create folder: ${message}`)
          }
        })
    )

    // Behavior section
    this.displayBehaviorSettings(containerEl)

    // Info section
    containerEl.createEl('h3', { text: 'About' })

    const infoEl = containerEl.createDiv()
    infoEl.style.color = 'var(--text-muted)'
    infoEl.style.fontSize = '0.9em'
    infoEl.innerHTML = `
      <p>Lachesis helps you plan projects through AI-powered interviews.</p>
      <p>Use the ribbon icon or command palette to start a new project interview.</p>
    `
  }

  private displayAnthropicSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h4', { text: 'Anthropic Configuration' })

    // API Key with password masking
    const apiKeySetting = new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your Anthropic API key. Get one at console.anthropic.com')

    let apiKeyInput: HTMLInputElement

    apiKeySetting.addText((text) => {
      apiKeyInput = text.inputEl
      text.inputEl.type = 'password'
      text.inputEl.style.width = '300px'
      text
        .setPlaceholder('sk-ant-...')
        .setValue(this.plugin.settings.anthropicApiKey)
        .onChange(async (value) => {
          this.plugin.settings.anthropicApiKey = value
          await this.plugin.saveSettings()
        })
    })

    // Toggle visibility button
    apiKeySetting.addButton((button) =>
      button
        .setIcon('eye')
        .setTooltip('Toggle visibility')
        .onClick(() => {
          if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text'
            button.setIcon('eye-off')
          } else {
            apiKeyInput.type = 'password'
            button.setIcon('eye')
          }
        })
    )

    // Model selection
    const models = getModelsForProvider('anthropic')

    new Setting(containerEl)
      .setName('Model')
      .setDesc('Claude model to use for interviews')
      .addDropdown((dropdown) => {
        models.forEach((m) => {
          dropdown.addOption(m.value, m.label)
        })
        dropdown
          .setValue(this.plugin.settings.anthropicModel)
          .onChange(async (value) => {
            this.plugin.settings.anthropicModel = value
            await this.plugin.saveSettings()
          })
      })
  }

  private displayOpenAISettings(containerEl: HTMLElement): void {
    containerEl.createEl('h4', { text: 'OpenAI Configuration' })

    // API Key with password masking
    const apiKeySetting = new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your OpenAI API key. Get one at platform.openai.com')

    let apiKeyInput: HTMLInputElement

    apiKeySetting.addText((text) => {
      apiKeyInput = text.inputEl
      text.inputEl.type = 'password'
      text.inputEl.style.width = '300px'
      text
        .setPlaceholder('sk-...')
        .setValue(this.plugin.settings.openaiApiKey)
        .onChange(async (value) => {
          this.plugin.settings.openaiApiKey = value
          await this.plugin.saveSettings()
        })
    })

    // Toggle visibility button
    apiKeySetting.addButton((button) =>
      button
        .setIcon('eye')
        .setTooltip('Toggle visibility')
        .onClick(() => {
          if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text'
            button.setIcon('eye-off')
          } else {
            apiKeyInput.type = 'password'
            button.setIcon('eye')
          }
        })
    )

    // Model selection
    const models = getModelsForProvider('openai')

    new Setting(containerEl)
      .setName('Model')
      .setDesc('OpenAI model to use for interviews')
      .addDropdown((dropdown) => {
        models.forEach((m) => {
          dropdown.addOption(m.value, m.label)
        })
        dropdown
          .setValue(this.plugin.settings.openaiModel)
          .onChange(async (value) => {
            this.plugin.settings.openaiModel = value
            await this.plugin.saveSettings()
          })
      })
  }

  private displayGitHubSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'GitHub Integration' })

    const descEl = containerEl.createDiv()
    descEl.style.color = 'var(--text-muted)'
    descEl.style.fontSize = '0.9em'
    descEl.style.marginBottom = '1em'
    descEl.setText(
      'A personal access token is required to fetch commit history from private repositories.'
    )

    // Token with password masking
    const tokenSetting = new Setting(containerEl)
      .setName('Personal Access Token')
      .setDesc('Generate at github.com/settings/tokens with "repo" scope')

    let tokenInput: HTMLInputElement

    tokenSetting.addText((text) => {
      tokenInput = text.inputEl
      text.inputEl.type = 'password'
      text.inputEl.style.width = '300px'
      text
        .setPlaceholder('ghp_...')
        .setValue(this.plugin.settings.githubToken)
        .onChange(async (value) => {
          this.plugin.settings.githubToken = value
          await this.plugin.saveSettings()
        })
    })

    // Toggle visibility button
    tokenSetting.addButton((button) =>
      button
        .setIcon('eye')
        .setTooltip('Toggle visibility')
        .onClick(() => {
          if (tokenInput.type === 'password') {
            tokenInput.type = 'text'
            button.setIcon('eye-off')
          } else {
            tokenInput.type = 'password'
            button.setIcon('eye')
          }
        })
    )
  }

  private displayBehaviorSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Behavior' })

    new Setting(containerEl)
      .setName('Auto-apply changes')
      .setDesc(
        'When enabled, AI-proposed changes are applied immediately without showing a review dialog. ' +
        'Use with caution — changes will be written to files automatically.'
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoAcceptChanges)
          .onChange(async (value) => {
            this.plugin.settings.autoAcceptChanges = value
            await this.plugin.saveSettings()
          })
      )
  }

  private displayConnectionTest(containerEl: HTMLElement): void {
    const testConnectionSetting = new Setting(containerEl)
      .setName('Test Connection')
      .setDesc('Verify your API key works with the selected model')

    let statusEl: HTMLElement

    testConnectionSetting.addButton((button) =>
      button
        .setButtonText('Test Connection')
        .setCta()
        .onClick(async () => {
          button.setDisabled(true)
          button.setButtonText('Testing...')

          if (statusEl) statusEl.remove()

          try {
            const provider = getProvider(this.plugin.settings)
            const result = await provider.testConnection()

            button.setDisabled(false)
            button.setButtonText('Test Connection')

            statusEl = testConnectionSetting.descEl.createSpan()
            statusEl.style.marginLeft = '10px'

            if (result.connected) {
              statusEl.style.color = 'var(--text-success)'
              statusEl.setText(`✓ Connected to ${provider.displayName}`)
              new Notice(`${provider.displayName} connection successful!`)
            } else {
              statusEl.style.color = 'var(--text-error)'
              statusEl.setText(`✗ ${result.error}`)
              new Notice(`Connection failed: ${result.error}`)
            }
          } catch (err) {
            button.setDisabled(false)
            button.setButtonText('Test Connection')

            statusEl = testConnectionSetting.descEl.createSpan()
            statusEl.style.marginLeft = '10px'
            statusEl.style.color = 'var(--text-error)'

            const message = err instanceof Error ? err.message : String(err)
            statusEl.setText(`✗ ${message}`)
            new Notice(`Connection failed: ${message}`)
          }
        })
    )
  }
}
