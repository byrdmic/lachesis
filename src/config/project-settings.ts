import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import type { AIProvider, LachesisConfig } from './types.ts'
import { applyConfigUpgrades } from './config.ts'

const SETTINGS_FILE_NAME = 'Settings.json'
const ALLOWED_PROVIDERS: AIProvider[] = ['anthropic', 'openai', 'vertex', 'other']
const PROJECT_SETTING_KEYS = new Set(['defaultProvider', 'defaultModel', 'apiKeyEnvVar'])

export type ProjectSettingsResult = {
  config: LachesisConfig
  found: boolean
  settingsPath: string
  overrides: Partial<LachesisConfig>
  warnings: string[]
  error?: string
}

/**
 * Load project-scoped overrides from Settings.json in a project directory.
 * The vault path is always preserved from the base config.
 */
export function loadProjectSettings(
  baseConfig: LachesisConfig,
  projectPath: string,
): ProjectSettingsResult {
  const settingsPath = join(projectPath, SETTINGS_FILE_NAME)

  if (!existsSync(settingsPath)) {
    return {
      config: baseConfig,
      found: false,
      settingsPath,
      overrides: {},
      warnings: [],
    }
  }

  try {
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf-8'))

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        config: baseConfig,
        found: true,
        settingsPath,
        overrides: {},
        warnings: [],
        error: 'Settings.json must contain a JSON object.',
      }
    }

    const raw = parsed as Record<string, unknown>
    const overrides: Partial<LachesisConfig> = {}
    const warnings: string[] = []

    if ('defaultProvider' in raw) {
      const provider = raw.defaultProvider
      if (typeof provider === 'string' && ALLOWED_PROVIDERS.includes(provider as AIProvider)) {
        overrides.defaultProvider = provider as AIProvider
      } else {
        warnings.push(
          'defaultProvider must be one of anthropic | openai | vertex | other.',
        )
      }
    }

    if ('defaultModel' in raw) {
      const model = raw.defaultModel
      if (typeof model === 'string' && model.trim() !== '') {
        overrides.defaultModel = model
      } else {
        warnings.push('defaultModel must be a non-empty string.')
      }
    }

    if ('apiKeyEnvVar' in raw) {
      const apiKeyEnvVar = raw.apiKeyEnvVar
      if (typeof apiKeyEnvVar === 'string' && apiKeyEnvVar.trim() !== '') {
        overrides.apiKeyEnvVar = apiKeyEnvVar
      } else {
        warnings.push('apiKeyEnvVar must be a non-empty string.')
      }
    }

    const unknownKeys = Object.keys(raw).filter((key) => !PROJECT_SETTING_KEYS.has(key))
    if (unknownKeys.length > 0) {
      warnings.push(`Ignored unknown (or global) settings: ${unknownKeys.join(', ')}.`)
    }

    const mergedConfig = applyConfigUpgrades({ ...baseConfig, ...overrides }).config

    return {
      config: mergedConfig,
      found: true,
      settingsPath,
      overrides,
      warnings,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      config: baseConfig,
      found: true,
      settingsPath,
      overrides: {},
      warnings: [],
      error: `Failed to read Settings.json: ${message}`,
    }
  }
}

export type SaveProjectSettingsResult = {
  success: boolean
  settingsPath: string
  error?: string
}

/**
 * Save project-scoped settings to Settings.json in a project directory.
 * Only saves the allowed project-level settings (provider, model, apiKeyEnvVar).
 */
export function saveProjectSettings(
  projectPath: string,
  settings: Partial<LachesisConfig>,
): SaveProjectSettingsResult {
  const settingsPath = join(projectPath, SETTINGS_FILE_NAME)

  // Filter to only allowed project-level settings
  const projectSettings: Partial<LachesisConfig> = {}
  if (settings.defaultProvider !== undefined) {
    projectSettings.defaultProvider = settings.defaultProvider
  }
  if (settings.defaultModel !== undefined) {
    projectSettings.defaultModel = settings.defaultModel
  }
  if (settings.apiKeyEnvVar !== undefined) {
    projectSettings.apiKeyEnvVar = settings.apiKeyEnvVar
  }

  try {
    // Ensure directory exists
    const dir = dirname(settingsPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(settingsPath, JSON.stringify(projectSettings, null, 2) + '\n', 'utf-8')

    return {
      success: true,
      settingsPath,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      settingsPath,
      error: `Failed to save Settings.json: ${message}`,
    }
  }
}

