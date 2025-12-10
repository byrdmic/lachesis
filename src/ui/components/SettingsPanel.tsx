import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { Select } from './Select.tsx'
import { TextInput } from './TextInput.tsx'
import type { LachesisConfig, AIProvider } from '../../config/types.ts'

type ProjectSettingsSummary = {
  projectName?: string
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
  onClose: () => void
}

type SettingsView = 'main' | 'provider' | 'model' | 'apikey' | 'vault'

export function SettingsPanel({
  config,
  projectSettings,
  onSave,
  onClose,
}: SettingsPanelProps) {
  const [view, setView] = useState<SettingsView>('main')
  const [tempModel, setTempModel] = useState(config.defaultModel)
  const [tempApiKeyVar, setTempApiKeyVar] = useState(config.apiKeyEnvVar)
  const [tempVaultPath, setTempVaultPath] = useState(config.vaultPath)
  const projectOverrides = projectSettings?.overrides ?? {}
  const hasProjectOverrides = Object.keys(projectOverrides).length > 0

  // Reset temp values when view changes
  useEffect(() => {
    if (view === 'model') {
      setTempModel(config.defaultModel)
    } else if (view === 'apikey') {
      setTempApiKeyVar(config.apiKeyEnvVar)
    } else if (view === 'vault') {
      setTempVaultPath(config.vaultPath)
    }
  }, [view, config.defaultModel, config.apiKeyEnvVar, config.vaultPath])

  useInput((input, key) => {
    if (key.escape) {
      if (view === 'main') {
        onClose()
      } else {
        setView('main')
      }
    }
  })

  if (view === 'provider') {
    return (
      <SettingsContainer title="Global AI Provider" onBack={() => setView('main')}>
        <Select
          label="Select AI provider:"
          options={[
            { label: 'OpenAI', value: 'openai' },
            { label: 'Anthropic', value: 'anthropic' },
            { label: 'Vertex AI', value: 'vertex' },
            { label: 'Other', value: 'other' },
          ]}
          onSelect={(value) => {
            onSave({ defaultProvider: value as AIProvider })
            setView('main')
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>Applies to all projects (global config).</Text>
        </Box>
      </SettingsContainer>
    )
  }

  if (view === 'model') {
    return (
      <SettingsContainer title="Global Model" onBack={() => setView('main')}>
        <TextInput
          label="Enter model name (e.g., gpt-4, claude-3-opus):"
          value={tempModel}
          onChange={setTempModel}
          placeholder={config.defaultModel}
          onSubmit={(value) => {
            if (value.trim()) {
              onSave({ defaultModel: value.trim() })
            }
            setView('main')
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>Applies to all projects (global config).</Text>
        </Box>
      </SettingsContainer>
    )
  }

  if (view === 'apikey') {
    return (
      <SettingsContainer
        title="Global API Key Environment Variable"
        onBack={() => setView('main')}
      >
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
          <Text dimColor>Applies to all projects (global config).</Text>
        </Box>
      </SettingsContainer>
    )
  }

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

  // Main settings view
  return (
    <SettingsContainer title="Settings" onBack={onClose}>
      <SettingsSection
        title="Global settings"
        subtitle="Applies to all projects (stored in ~/.lachesis/config.json)"
      >
        <Select
          label="Choose a global setting to modify:"
          options={[
            {
              label: `AI Provider: ${config.defaultProvider}`,
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
            Updates in this section change your global defaults for every project.
          </Text>
        </Box>
      </SettingsSection>

      <SettingsSection
        title="Project settings"
        subtitle="Overrides defined per project in Settings.json"
      >
        {projectSettings ? (
          <>
            {projectSettings.settingsPath && (
              <Text dimColor>Path: {projectSettings.settingsPath}</Text>
            )}
            {projectSettings.error ? (
              <Text color="red">{projectSettings.error}</Text>
            ) : projectSettings.found ? (
              hasProjectOverrides ? (
                Object.entries(projectOverrides).map(([key, value]) => (
                  <Text key={key}>
                    {key}: {String(value)}
                  </Text>
                ))
              ) : (
                <Text dimColor>Settings.json found; no recognized overrides.</Text>
              )
            ) : (
              <Text dimColor>No project settings loaded; using global defaults.</Text>
            )}
            {projectSettings.warnings?.map((warning, idx) => (
              <Text key={`project-settings-warning-${idx}`} color="yellow">
                {warning}
              </Text>
            ))}
          </>
        ) : (
          <>
            <Text dimColor>
              Project settings live in a project-local Settings.json and can override
              provider, model, or API key env var.
            </Text>
            <Text dimColor>
              Open a project to view its overrides alongside the global settings.
            </Text>
          </>
        )}
      </SettingsSection>

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

function SettingsContainer({
  title,
  onBack,
  children,
}: SettingsContainerProps) {
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

type SettingsSectionProps = {
  title: string
  subtitle?: string
  children: React.ReactNode
}

function SettingsSection({ title, subtitle, children }: SettingsSectionProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>{title}</Text>
      {subtitle && <Text dimColor>{subtitle}</Text>}
      <Box marginLeft={2} flexDirection="column">
        {children}
      </Box>
    </Box>
  )
}
