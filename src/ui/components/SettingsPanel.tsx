import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { Select } from './Select.tsx'
import { TextInput } from './TextInput.tsx'
import type { LachesisConfig, AIProvider } from '../../config/types.ts'
import {
  getModelsForProvider,
  getProviderDisplayName,
  getDefaultApiKeyEnvVar,
} from '../../config/types.ts'

type ProjectSettingsSummary = {
  projectName?: string
  projectPath?: string
  settingsPath?: string
  found?: boolean
  overrides?: Partial<LachesisConfig>
  warnings?: string[]
  error?: string
}

type SettingsPanelProps = {
  config: LachesisConfig
  projectSettings?: ProjectSettingsSummary
  onSave: (updates: Partial<LachesisConfig>) => void
  onSaveProject?: (updates: Partial<LachesisConfig>) => void
  onClose: () => void
}

type SettingsView =
  | 'main'
  | 'provider'
  | 'model'
  | 'apikey'
  | 'vault'
  | 'project-provider'
  | 'project-model'
  | 'project-apikey'

export function SettingsPanel({
  config,
  projectSettings,
  onSave,
  onSaveProject,
  onClose,
}: SettingsPanelProps) {
  const [view, setView] = useState<SettingsView>('main')
  const [tempModel, setTempModel] = useState(config.defaultModel)
  const [tempApiKeyVar, setTempApiKeyVar] = useState(config.apiKeyEnvVar)
  const [tempVaultPath, setTempVaultPath] = useState(config.vaultPath)

  // Project-level temp values
  const [tempProjectModel, setTempProjectModel] = useState(
    projectSettings?.overrides?.defaultModel ?? '',
  )
  const [tempProjectApiKeyVar, setTempProjectApiKeyVar] = useState(
    projectSettings?.overrides?.apiKeyEnvVar ?? '',
  )

  const projectOverrides = projectSettings?.overrides ?? {}
  const hasProjectContext = Boolean(projectSettings?.projectPath)

  // Reset temp values when view changes
  useEffect(() => {
    if (view === 'model') {
      setTempModel(config.defaultModel)
    } else if (view === 'apikey') {
      setTempApiKeyVar(config.apiKeyEnvVar)
    } else if (view === 'vault') {
      setTempVaultPath(config.vaultPath)
    } else if (view === 'project-model') {
      setTempProjectModel(projectOverrides.defaultModel ?? '')
    } else if (view === 'project-apikey') {
      setTempProjectApiKeyVar(projectOverrides.apiKeyEnvVar ?? '')
    }
  }, [
    view,
    config.defaultModel,
    config.apiKeyEnvVar,
    config.vaultPath,
    projectOverrides.defaultModel,
    projectOverrides.apiKeyEnvVar,
  ])

  useInput(
    (input, key) => {
      if (key.escape) {
        if (view === 'main') {
          onClose()
        } else {
          setView('main')
        }
      }
    },
    { isActive: true },
  )

  // Project provider selection view
  if (view === 'project-provider') {
    return (
      <SettingsContainer title="Project AI Provider" onBack={() => setView('main')}>
        <Select
          label="Select AI provider for this project:"
          options={[
            { label: 'Anthropic SDK (Claude via API)', value: 'anthropic-sdk' },
            { label: 'Claude Code (MAX subscription)', value: 'claude-code' },
            { label: 'OpenAI (Vercel AI SDK)', value: 'openai' },
            { label: 'Use global default', value: '__clear__' },
          ]}
          onSelect={(value) => {
            if (onSaveProject) {
              if (value === '__clear__') {
                // Remove the override by saving without this key
                const newOverrides = { ...projectOverrides }
                delete newOverrides.defaultProvider
                onSaveProject(newOverrides)
              } else {
                onSaveProject({ ...projectOverrides, defaultProvider: value as AIProvider })
              }
            }
            setView('main')
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>
            Global default: {getProviderDisplayName(config.defaultProvider)}
          </Text>
        </Box>
      </SettingsContainer>
    )
  }

  // Project model input view
  if (view === 'project-model') {
    // Use project provider if set, otherwise global provider
    const effectiveProvider = projectOverrides.defaultProvider ?? config.defaultProvider
    const availableModels = getModelsForProvider(effectiveProvider)
    const modelOptions: Array<{ label: string; value: string }> = availableModels.map((m) => ({ label: m, value: m }))
    modelOptions.push({ label: 'Use global default', value: '__clear__' })

    return (
      <SettingsContainer title="Project Model" onBack={() => setView('main')}>
        <Select
          label={`Select ${getProviderDisplayName(effectiveProvider)} model for this project:`}
          options={modelOptions}
          onSelect={(value) => {
            if (onSaveProject) {
              if (value === '__clear__') {
                const newOverrides = { ...projectOverrides }
                delete newOverrides.defaultModel
                onSaveProject(newOverrides)
              } else {
                onSaveProject({ ...projectOverrides, defaultModel: value })
              }
            }
            setView('main')
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>
            Global default: {config.defaultModel}
          </Text>
        </Box>
      </SettingsContainer>
    )
  }

  // Project API key env var input view
  if (view === 'project-apikey') {
    const effectiveProvider = projectOverrides.defaultProvider ?? config.defaultProvider
    const defaultEnvVar = getDefaultApiKeyEnvVar(effectiveProvider)
    const needsApiKey = effectiveProvider !== 'claude-code'

    return (
      <SettingsContainer title="Project API Key Env Var" onBack={() => setView('main')}>
        {needsApiKey ? (
          <>
            <TextInput
              label="Enter env variable name for this project:"
              value={tempProjectApiKeyVar}
              onChange={setTempProjectApiKeyVar}
              placeholder={config.apiKeyEnvVar}
              onSubmit={(value) => {
                if (onSaveProject) {
                  const trimmed = value.trim()
                  if (trimmed) {
                    onSaveProject({ ...projectOverrides, apiKeyEnvVar: trimmed })
                  } else {
                    // Clear the override
                    const newOverrides = { ...projectOverrides }
                    delete newOverrides.apiKeyEnvVar
                    onSaveProject(newOverrides)
                  }
                }
                setView('main')
              }}
            />
            <Box marginTop={1}>
              <Text dimColor>
                Default for {getProviderDisplayName(effectiveProvider)}: {defaultEnvVar}
              </Text>
            </Box>
          </>
        ) : (
          <Box flexDirection="column">
            <Text color="green">Claude Code uses your MAX subscription - no API key needed!</Text>
            <Box marginTop={1}>
              <Text dimColor>Press Esc to go back</Text>
            </Box>
          </Box>
        )}
      </SettingsContainer>
    )
  }

  // Global provider selection view
  if (view === 'provider') {
    return (
      <SettingsContainer title="Global AI Provider" onBack={() => setView('main')}>
        <Select
          label="Select AI provider:"
          options={[
            { label: 'Anthropic SDK (Claude via API)', value: 'anthropic-sdk' },
            { label: 'Claude Code (MAX subscription)', value: 'claude-code' },
            { label: 'OpenAI (Vercel AI SDK)', value: 'openai' },
          ]}
          onSelect={(value) => {
            onSave({ defaultProvider: value as AIProvider })
            setView('main')
          }}
        />
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Anthropic SDK: Requires ANTHROPIC_API_KEY env variable</Text>
          <Text dimColor>Claude Code: Uses MAX subscription via CLI (no API key)</Text>
          <Text dimColor>OpenAI: Requires OPENAI_API_KEY env variable</Text>
        </Box>
      </SettingsContainer>
    )
  }

  // Global model selection view
  if (view === 'model') {
    const availableModels = getModelsForProvider(config.defaultProvider)
    const modelOptions = availableModels.map((m) => ({ label: m, value: m }))

    return (
      <SettingsContainer title="Global Model" onBack={() => setView('main')}>
        <Select
          label={`Select ${getProviderDisplayName(config.defaultProvider)} model:`}
          options={modelOptions}
          onSelect={(value) => {
            onSave({ defaultModel: value })
            setView('main')
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>Applies to all projects (global config).</Text>
        </Box>
      </SettingsContainer>
    )
  }

  // Global API key env var input view
  if (view === 'apikey') {
    const needsApiKey = config.defaultProvider !== 'claude-code'
    const defaultEnvVar = getDefaultApiKeyEnvVar(config.defaultProvider)

    return (
      <SettingsContainer
        title="Global API Key Environment Variable"
        onBack={() => setView('main')}
      >
        {needsApiKey ? (
          <>
            <TextInput
              label="Enter env variable name for API key:"
              value={tempApiKeyVar}
              onChange={setTempApiKeyVar}
              placeholder={config.apiKeyEnvVar}
              onSubmit={(value) => {
                if (value.trim()) {
                  onSave({ apiKeyEnvVar: value.trim() })
                }
                setView('main')
              }}
            />
            <Box marginTop={1}>
              <Text dimColor>Default for {getProviderDisplayName(config.defaultProvider)}: {defaultEnvVar}</Text>
            </Box>
          </>
        ) : (
          <Box flexDirection="column">
            <Text color="green">Claude Code uses your MAX subscription - no API key needed!</Text>
            <Box marginTop={1}>
              <Text dimColor>Press Esc to go back</Text>
            </Box>
          </Box>
        )}
      </SettingsContainer>
    )
  }

  // Global vault path input view
  if (view === 'vault') {
    return (
      <SettingsContainer title="Vault Path" onBack={() => setView('main')}>
        <TextInput
          label="Enter the base Obsidian projects path:"
          value={tempVaultPath}
          onChange={setTempVaultPath}
          placeholder={config.vaultPath || 'e.g., /Users/me/Documents/Obsidian/Projects'}
          onSubmit={(value) => {
            const trimmed = value.trim()
            if (trimmed) {
              onSave({ vaultPath: trimmed })
            }
            setView('main')
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>
            This is the folder Lachesis scans for projects and writes new ones to.
          </Text>
        </Box>
      </SettingsContainer>
    )
  }

  // Main settings view - show EITHER Project Settings OR Global Settings
  if (hasProjectContext) {
    // Project Settings only
    const projectProviderDisplay = projectOverrides.defaultProvider
      ? getProviderDisplayName(projectOverrides.defaultProvider)
      : `(${getProviderDisplayName(config.defaultProvider)})`

    return (
      <SettingsContainer
        title={`Project Settings: ${projectSettings?.projectName || 'Project'}`}
        onBack={onClose}
      >
        <Select
          label="Choose a setting to modify:"
          options={[
            {
              label: `AI Provider: ${projectProviderDisplay}`,
              value: 'project-provider',
            },
            {
              label: `Model: ${projectOverrides.defaultModel || `(${config.defaultModel})`}`,
              value: 'project-model',
            },
            {
              label: `API Key Env: ${projectOverrides.apiKeyEnvVar || `(${config.apiKeyEnvVar})`}`,
              value: 'project-apikey',
            },
            { label: 'Close settings', value: 'close' },
          ]}
          onSelect={(value) => {
            if (value === 'close') {
              onClose()
            } else {
              setView(value as SettingsView)
            }
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>
            Values in parentheses show the global default. Set a value to override for this
            project.
          </Text>
        </Box>
        {projectSettings?.warnings?.map((warning, idx) => (
          <Text key={`project-settings-warning-${idx}`} color="yellow">
            {warning}
          </Text>
        ))}
        {projectSettings?.error && <Text color="red">{projectSettings.error}</Text>}
        <Box marginTop={1}>
          <Text dimColor>Press Esc to close</Text>
        </Box>
      </SettingsContainer>
    )
  }

  // Global Settings only (no project loaded)
  return (
    <SettingsContainer title="Global Settings" onBack={onClose}>
      <Select
        label="Choose a setting to modify:"
        options={[
          {
            label: `AI Provider: ${getProviderDisplayName(config.defaultProvider)}`,
            value: 'provider',
          },
          { label: `Model: ${config.defaultModel}`, value: 'model' },
          { label: `API Key Env: ${config.apiKeyEnvVar}`, value: 'apikey' },
          {
            label: `Vault Path: ${config.vaultPath || 'Not set'}`,
            value: 'vault',
          },
          { label: 'Close settings', value: 'close' },
        ]}
        onSelect={(value) => {
          if (value === 'close') {
            onClose()
          } else {
            setView(value as SettingsView)
          }
        }}
      />
      <Box marginTop={1}>
        <Text dimColor>
          These settings apply to all projects.
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Esc to close</Text>
      </Box>
    </SettingsContainer>
  )
}

type SettingsContainerProps = {
  title: string
  onBack: () => void
  children: React.ReactNode
}

function SettingsContainer({ title, onBack, children }: SettingsContainerProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      padding={1}
      marginY={1}
    >
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          {title}
        </Text>
      </Box>
      {children}
    </Box>
  )
}
