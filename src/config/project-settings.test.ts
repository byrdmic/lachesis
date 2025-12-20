import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { loadProjectSettings, saveProjectSettings } from './project-settings.ts'
import type { LachesisConfig } from './types.ts'

// Create a base config for testing
function createBaseConfig(overrides: Partial<LachesisConfig> = {}): LachesisConfig {
  return {
    vaultPath: '/vault/projects',
    defaultProvider: 'anthropic-sdk',
    defaultModel: 'claude-sonnet-4-5-20250929',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    ...overrides,
  }
}

describe('project-settings', () => {
  let tempDir: string
  let projectPath: string

  beforeEach(() => {
    // Create a unique temp directory for each test
    tempDir = join(tmpdir(), `lachesis-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    projectPath = join(tempDir, 'test-project')
    mkdirSync(projectPath, { recursive: true })
  })

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('loadProjectSettings', () => {
    describe('when Settings.json does not exist', () => {
      it('returns base config unchanged', () => {
        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.config).toEqual(baseConfig)
        expect(result.found).toBe(false)
        expect(result.overrides).toEqual({})
        expect(result.warnings).toEqual([])
        expect(result.error).toBeUndefined()
      })

      it('includes correct settings path', () => {
        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.settingsPath).toBe(join(projectPath, 'Settings.json'))
      })
    })

    describe('when Settings.json exists', () => {
      it('loads and merges defaultProvider override', () => {
        const settings = { defaultProvider: 'anthropic-sdk' }
        writeFileSync(join(projectPath, 'Settings.json'), JSON.stringify(settings))

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.found).toBe(true)
        expect(result.config.defaultProvider).toBe('anthropic-sdk')
        expect(result.overrides).toEqual({ defaultProvider: 'anthropic-sdk' })
      })

      it('loads and merges defaultModel override', () => {
        const settings = { defaultModel: 'claude-opus-4-5-20251101' }
        writeFileSync(join(projectPath, 'Settings.json'), JSON.stringify(settings))

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.config.defaultModel).toBe('claude-opus-4-5-20251101')
        expect(result.overrides).toEqual({ defaultModel: 'claude-opus-4-5-20251101' })
      })

      it('loads and merges apiKeyEnvVar override', () => {
        const settings = { apiKeyEnvVar: 'PROJECT_API_KEY' }
        writeFileSync(join(projectPath, 'Settings.json'), JSON.stringify(settings))

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.config.apiKeyEnvVar).toBe('PROJECT_API_KEY')
        expect(result.overrides).toEqual({ apiKeyEnvVar: 'PROJECT_API_KEY' })
      })

      it('merges multiple settings', () => {
        const settings = {
          defaultProvider: 'anthropic-sdk',
          defaultModel: 'claude-opus-4-5-20251101',
          apiKeyEnvVar: 'CUSTOM_ANTHROPIC_KEY',
        }
        writeFileSync(join(projectPath, 'Settings.json'), JSON.stringify(settings))

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.config.defaultProvider).toBe('anthropic-sdk')
        expect(result.config.defaultModel).toBe('claude-opus-4-5-20251101')
        expect(result.config.apiKeyEnvVar).toBe('CUSTOM_ANTHROPIC_KEY')
        // vaultPath should remain from base
        expect(result.config.vaultPath).toBe('/vault/projects')
      })

      it('preserves vaultPath from base config (cannot override)', () => {
        const settings = { vaultPath: '/other/path' }
        writeFileSync(join(projectPath, 'Settings.json'), JSON.stringify(settings))

        const baseConfig = createBaseConfig({ vaultPath: '/original/path' })
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.config.vaultPath).toBe('/original/path')
        expect(result.warnings.some(w => w.includes('Ignored unknown'))).toBe(true)
      })
    })

    describe('validation and warnings', () => {
      it('warns for invalid provider', () => {
        const settings = { defaultProvider: 'invalid-provider' }
        writeFileSync(join(projectPath, 'Settings.json'), JSON.stringify(settings))

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.config.defaultProvider).toBe('anthropic-sdk') // unchanged from base
        expect(result.warnings.some(w => w.includes('defaultProvider'))).toBe(true)
      })

      it('warns for empty model string', () => {
        const settings = { defaultModel: '' }
        writeFileSync(join(projectPath, 'Settings.json'), JSON.stringify(settings))

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.config.defaultModel).toBe('claude-sonnet-4-5-20250929') // unchanged
        expect(result.warnings.some(w => w.includes('defaultModel'))).toBe(true)
      })

      it('warns for whitespace-only model string', () => {
        const settings = { defaultModel: '   ' }
        writeFileSync(join(projectPath, 'Settings.json'), JSON.stringify(settings))

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.config.defaultModel).toBe('claude-sonnet-4-5-20250929') // unchanged
        expect(result.warnings.some(w => w.includes('defaultModel'))).toBe(true)
      })

      it('warns for unknown settings keys', () => {
        const settings = {
          unknownSetting: 'value',
          anotherUnknown: 123,
        }
        writeFileSync(join(projectPath, 'Settings.json'), JSON.stringify(settings))

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.warnings.some(w => w.includes('unknownSetting'))).toBe(true)
        expect(result.warnings.some(w => w.includes('anotherUnknown'))).toBe(true)
      })

      it('handles null values gracefully', () => {
        const settings = {
          defaultProvider: null,
          defaultModel: null,
        }
        writeFileSync(join(projectPath, 'Settings.json'), JSON.stringify(settings))

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        // Should not crash, warnings should be generated
        expect(result.found).toBe(true)
      })
    })

    describe('error handling', () => {
      it('returns error for invalid JSON', () => {
        writeFileSync(join(projectPath, 'Settings.json'), '{ invalid json }')

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.found).toBe(true)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('Failed to read Settings.json')
        expect(result.config).toEqual(baseConfig) // fallback to base
      })

      it('returns error for non-object JSON (array)', () => {
        writeFileSync(join(projectPath, 'Settings.json'), '[1, 2, 3]')

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.found).toBe(true)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('must contain a JSON object')
      })

      it('returns error for non-object JSON (string)', () => {
        writeFileSync(join(projectPath, 'Settings.json'), '"just a string"')

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.found).toBe(true)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('must contain a JSON object')
      })

      it('returns error for null JSON', () => {
        writeFileSync(join(projectPath, 'Settings.json'), 'null')

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.found).toBe(true)
        expect(result.error).toBeDefined()
      })
    })

    describe('provider validation', () => {
      it('accepts anthropic-sdk as valid provider', () => {
        const settings = { defaultProvider: 'anthropic-sdk' }
        writeFileSync(join(projectPath, 'Settings.json'), JSON.stringify(settings))

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.config.defaultProvider).toBe('anthropic-sdk')
        expect(result.warnings).toEqual([])
      })

      it('accepts openai as valid provider', () => {
        const settings = { defaultProvider: 'openai' }
        writeFileSync(join(projectPath, 'Settings.json'), JSON.stringify(settings))

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.config.defaultProvider).toBe('openai')
        expect(result.warnings).toEqual([])
      })

      it('accepts claude-code as valid provider', () => {
        const settings = { defaultProvider: 'claude-code' }
        writeFileSync(join(projectPath, 'Settings.json'), JSON.stringify(settings))

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.config.defaultProvider).toBe('claude-code')
        expect(result.warnings).toEqual([])
      })

      it('rejects invalid providers', () => {
        const settings = { defaultProvider: 'invalid-provider' }
        writeFileSync(join(projectPath, 'Settings.json'), JSON.stringify(settings))

        const baseConfig = createBaseConfig()
        const result = loadProjectSettings(baseConfig, projectPath)

        expect(result.config.defaultProvider).toBe('anthropic-sdk') // unchanged
        expect(result.warnings.some(w => w.includes('defaultProvider'))).toBe(true)
      })
    })
  })

  describe('saveProjectSettings', () => {
    it('saves settings to Settings.json', () => {
      const settings: Partial<LachesisConfig> = {
        defaultProvider: 'anthropic-sdk',
        defaultModel: 'claude-opus-4-5-20251101',
      }

      const result = saveProjectSettings(projectPath, settings)

      expect(result.success).toBe(true)
      expect(existsSync(result.settingsPath)).toBe(true)

      const saved = JSON.parse(readFileSync(result.settingsPath, 'utf-8'))
      expect(saved.defaultProvider).toBe('anthropic-sdk')
      expect(saved.defaultModel).toBe('claude-opus-4-5-20251101')
    })

    it('only saves allowed project-level keys', () => {
      const settings: Partial<LachesisConfig> = {
        defaultProvider: 'anthropic-sdk',
        defaultModel: 'claude-opus-4-5-20251101',
        apiKeyEnvVar: 'CUSTOM_KEY',
        vaultPath: '/should/not/be/saved', // not a project-level setting
      }

      const result = saveProjectSettings(projectPath, settings)

      const saved = JSON.parse(readFileSync(result.settingsPath, 'utf-8'))
      expect(saved.defaultProvider).toBe('anthropic-sdk')
      expect(saved.defaultModel).toBe('claude-opus-4-5-20251101')
      expect(saved.apiKeyEnvVar).toBe('CUSTOM_KEY')
      expect(saved.vaultPath).toBeUndefined()
    })

    it('creates directory if it does not exist', () => {
      const newProjectPath = join(tempDir, 'new-project', 'nested')
      expect(existsSync(newProjectPath)).toBe(false)

      const settings: Partial<LachesisConfig> = {
        defaultModel: 'test-model',
      }

      const result = saveProjectSettings(newProjectPath, settings)

      expect(result.success).toBe(true)
      expect(existsSync(result.settingsPath)).toBe(true)
    })

    it('overwrites existing Settings.json', () => {
      // Create initial settings
      const initial = { defaultModel: 'claude-haiku-3-5-20241022' }
      writeFileSync(join(projectPath, 'Settings.json'), JSON.stringify(initial))

      // Save new settings
      const newSettings: Partial<LachesisConfig> = {
        defaultModel: 'claude-opus-4-5-20251101',
      }
      saveProjectSettings(projectPath, newSettings)

      const saved = JSON.parse(readFileSync(join(projectPath, 'Settings.json'), 'utf-8'))
      expect(saved.defaultModel).toBe('claude-opus-4-5-20251101')
    })

    it('handles empty settings object', () => {
      const result = saveProjectSettings(projectPath, {})

      expect(result.success).toBe(true)
      const saved = JSON.parse(readFileSync(result.settingsPath, 'utf-8'))
      expect(saved).toEqual({})
    })

    it('returns error for write failures', () => {
      // Create a file where the directory should be (making mkdir fail)
      const invalidPath = join(tempDir, 'file-not-dir')
      writeFileSync(invalidPath, 'not a directory')

      const result = saveProjectSettings(join(invalidPath, 'project'), {
        defaultModel: 'test',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('Failed to save Settings.json')
    })

    it('formats JSON with indentation', () => {
      const settings: Partial<LachesisConfig> = {
        defaultProvider: 'anthropic-sdk',
        defaultModel: 'claude-sonnet-4-5-20250929',
      }

      const result = saveProjectSettings(projectPath, settings)

      const content = readFileSync(result.settingsPath, 'utf-8')
      // Should be pretty-printed (contains newlines and indentation)
      expect(content).toContain('\n')
      expect(content).toContain('  ') // 2-space indentation
    })

    it('adds trailing newline to file', () => {
      const settings: Partial<LachesisConfig> = {
        defaultModel: 'test',
      }

      const result = saveProjectSettings(projectPath, settings)

      const content = readFileSync(result.settingsPath, 'utf-8')
      expect(content.endsWith('\n')).toBe(true)
    })
  })

  describe('round-trip consistency', () => {
    it('load after save returns same values', () => {
      const baseConfig = createBaseConfig()
      const projectSettings: Partial<LachesisConfig> = {
        defaultProvider: 'anthropic-sdk',
        defaultModel: 'claude-opus-4-5-20251101',
        apiKeyEnvVar: 'PROJECT_KEY',
      }

      saveProjectSettings(projectPath, projectSettings)
      const result = loadProjectSettings(baseConfig, projectPath)

      expect(result.config.defaultProvider).toBe('anthropic-sdk')
      expect(result.config.defaultModel).toBe('claude-opus-4-5-20251101')
      expect(result.config.apiKeyEnvVar).toBe('PROJECT_KEY')
    })
  })
})
