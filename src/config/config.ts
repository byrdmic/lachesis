// Configuration management for Lachesis
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import {
  type LachesisConfig,
  DEFAULT_CONFIG,
  OPENAI_MODELS,
} from './types.ts'
import {
  getConfigDir,
  getConfigPath,
  getDefaultVaultPath,
  getPlatformDisplayName,
} from './paths.ts'

export function applyConfigUpgrades(config: LachesisConfig): {
  config: LachesisConfig
  updated: boolean
} {
  let updated = false
  let next = { ...config }
  const openaiModelSet = new Set<string>(OPENAI_MODELS)

  // Normalize and validate OpenAI model identifiers
  if (next.defaultProvider === 'openai') {
    const normalized = next.defaultModel.startsWith('openai/')
      ? next.defaultModel
      : `openai/${next.defaultModel}`

    if (!openaiModelSet.has(normalized)) {
      next = { ...next, defaultModel: DEFAULT_CONFIG.defaultModel }
      updated = true
    } else if (normalized !== next.defaultModel) {
      next = { ...next, defaultModel: normalized }
      updated = true
    }
  }

  return { config: next, updated }
}

export type ConfigLoadResult =
  | { status: 'loaded'; config: LachesisConfig }
  | { status: 'created'; config: LachesisConfig; message: string }
  | { status: 'error'; error: string }

/**
 * Load config from ~/.lachesis/config.json
 * If it doesn't exist, create it with OS-detected defaults
 */
export function loadConfig(): ConfigLoadResult {
  const configPath = getConfigPath()
  const configDir = getConfigDir()

  try {
    // Check if config exists
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8')
      const parsed = JSON.parse(content) as LachesisConfig
      const { config, updated } = applyConfigUpgrades(parsed)
      if (updated) {
        saveConfig(config)
      }
      return { status: 'loaded', config }
    }

    // Config doesn't exist - create it
    const defaultVaultPath = getDefaultVaultPath()
    const platform = getPlatformDisplayName()

    const newConfig: LachesisConfig = {
      ...DEFAULT_CONFIG,
      vaultPath: defaultVaultPath,
    }

    // Ensure config directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }

    // Write the config
    writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8')

    const message =
      `Created config at ${configPath}\n` +
      `Detected platform: ${platform}\n` +
      `Default vault path: ${defaultVaultPath}\n` +
      `Update this path in the config if needed.`

    return { status: 'created', config: newConfig, message }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { status: 'error', error: `Failed to load config: ${error}` }
  }
}

/**
 * Save config to ~/.lachesis/config.json
 */
export function saveConfig(config: LachesisConfig): {
  success: boolean
  error?: string
} {
  const configPath = getConfigPath()
  const configDir = getConfigDir()

  try {
    // Ensure config directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Failed to save config: ${error}` }
  }
}

/**
 * Update a specific config field
 */
export function updateConfig(updates: Partial<LachesisConfig>): {
  success: boolean
  config?: LachesisConfig
  error?: string
} {
  const loadResult = loadConfig()

  if (loadResult.status === 'error') {
    return { success: false, error: loadResult.error }
  }

  const currentConfig = loadResult.config
  const newConfig: LachesisConfig = { ...currentConfig, ...updates }

  const saveResult = saveConfig(newConfig)
  if (!saveResult.success) {
    return { success: false, error: saveResult.error }
  }

  return { success: true, config: newConfig }
}

/**
 * Check if vault path exists and is accessible
 */
export function validateVaultPath(vaultPath: string): {
  valid: boolean
  error?: string
} {
  if (!vaultPath || vaultPath.trim() === '') {
    return { valid: false, error: 'Vault path is empty' }
  }

  // We don't require the path to exist yet - it will be created when scaffolding
  // Just check it's a reasonable path
  return { valid: true }
}
