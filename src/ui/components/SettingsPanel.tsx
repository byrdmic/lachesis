import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { Select } from './Select.tsx'
import { TextInput } from './TextInput.tsx'
import type { LachesisConfig, AIProvider, MCPWriteMode, MCPTransportMode } from '../../config/types.ts'
import { DEFAULT_MCP_CONFIG } from '../../config/types.ts'

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
  | 'mcp'
  | 'mcp-transport'
  | 'mcp-docker-image'
  | 'mcp-gateway-url'
  | 'mcp-host'
  | 'mcp-port'
  | 'mcp-apikey'
  | 'mcp-writemode'
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

  // MCP temp values - ensure obsidian config is always defined
  const mcpConfig = config.mcp ?? DEFAULT_MCP_CONFIG
  const obsidianConfig = mcpConfig.obsidian ?? DEFAULT_MCP_CONFIG.obsidian
  const dockerConfig = mcpConfig.docker ?? DEFAULT_MCP_CONFIG.docker
  const gatewayConfig = mcpConfig.gateway ?? DEFAULT_MCP_CONFIG.gateway
  const [tempMCPHost, setTempMCPHost] = useState(obsidianConfig.host)
  const [tempMCPPort, setTempMCPPort] = useState(String(obsidianConfig.port))
  const [tempMCPApiKeyVar, setTempMCPApiKeyVar] = useState(obsidianConfig.apiKeyEnvVar)
  const [tempDockerImage, setTempDockerImage] = useState(dockerConfig?.imageName ?? 'mcp/obsidian')
  const [tempGatewayUrl, setTempGatewayUrl] = useState(gatewayConfig?.url ?? 'http://localhost:8811/sse')

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
            { label: 'OpenAI', value: 'openai' },
            { label: 'Anthropic', value: 'anthropic' },
            { label: 'Vertex AI', value: 'vertex' },
            { label: 'Other', value: 'other' },
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
            Global default: {config.defaultProvider}
          </Text>
        </Box>
      </SettingsContainer>
    )
  }

  // Project model input view
  if (view === 'project-model') {
    return (
      <SettingsContainer title="Project Model" onBack={() => setView('main')}>
        <TextInput
          label="Enter model name for this project:"
          value={tempProjectModel}
          onChange={setTempProjectModel}
          placeholder={config.defaultModel}
          onSubmit={(value) => {
            if (onSaveProject) {
              const trimmed = value.trim()
              if (trimmed) {
                onSaveProject({ ...projectOverrides, defaultModel: trimmed })
              } else {
                // Clear the override
                const newOverrides = { ...projectOverrides }
                delete newOverrides.defaultModel
                onSaveProject(newOverrides)
              }
            }
            setView('main')
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>
            Leave empty to use global default: {config.defaultModel}
          </Text>
        </Box>
      </SettingsContainer>
    )
  }

  // Project API key env var input view
  if (view === 'project-apikey') {
    return (
      <SettingsContainer title="Project API Key Env Var" onBack={() => setView('main')}>
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
            Leave empty to use global default: {config.apiKeyEnvVar}
          </Text>
        </Box>
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

  // Global model input view
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

  // Global API key env var input view
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

  // MCP settings menu
  if (view === 'mcp') {
    const transportMode = mcpConfig.transportMode ?? 'uvx'
    const transportLabels: Record<string, string> = {
      uvx: 'uvx (Python)',
      docker: 'Docker',
      gateway: 'MCP Gateway (SSE)',
    }
    const transportLabel = transportLabels[transportMode] ?? transportMode

    // Build options dynamically based on transport mode
    const mcpOptions = [
      {
        label: `Enabled: ${mcpConfig.enabled ? 'Yes' : 'No'}`,
        value: 'toggle-enabled',
      },
      {
        label: `Transport: ${transportLabel}`,
        value: 'mcp-transport',
      },
    ]

    // Show Docker image option only when using docker transport
    if (transportMode === 'docker') {
      mcpOptions.push({
        label: `Docker Image: ${dockerConfig?.imageName ?? 'mcp/obsidian'}`,
        value: 'mcp-docker-image',
      })
    }

    // Show Gateway URL option only when using gateway transport
    if (transportMode === 'gateway') {
      mcpOptions.push({
        label: `Gateway URL: ${gatewayConfig?.url ?? 'http://localhost:8811/sse'}`,
        value: 'mcp-gateway-url',
      })
    }

    // Host/Port/API key only relevant for non-gateway modes
    if (transportMode !== 'gateway') {
      mcpOptions.push(
        {
          label: `Host: ${obsidianConfig.host}`,
          value: 'mcp-host',
        },
        {
          label: `Port: ${obsidianConfig.port}`,
          value: 'mcp-port',
        },
        {
          label: `API Key Env: ${obsidianConfig.apiKeyEnvVar}`,
          value: 'mcp-apikey',
        },
      )
    }

    mcpOptions.push(
      {
        label: `Write Mode: ${mcpConfig.writeMode}`,
        value: 'mcp-writemode',
      },
      { label: 'Back', value: 'back' },
    )

    return (
      <SettingsContainer title="MCP Settings" onBack={() => setView('main')}>
        <Select
          label="Configure MCP (Model Context Protocol):"
          options={mcpOptions}
          onSelect={(value) => {
            if (value === 'toggle-enabled') {
              onSave({
                mcp: {
                  ...mcpConfig,
                  enabled: !mcpConfig.enabled,
                },
              })
            } else if (value === 'back') {
              setView('main')
            } else {
              setView(value as SettingsView)
            }
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>
            MCP connects to Obsidian's REST API plugin for vault access.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            {transportMode === 'gateway'
              ? 'Connecting to Docker MCP Gateway via SSE.'
              : transportMode === 'docker'
                ? 'Using Docker container for mcp-obsidian server.'
                : 'Using uvx to run mcp-obsidian (requires Python/uv).'}
          </Text>
        </Box>
      </SettingsContainer>
    )
  }

  // MCP transport mode selection view
  if (view === 'mcp-transport') {
    return (
      <SettingsContainer title="MCP Transport" onBack={() => setView('mcp')}>
        <Select
          label="Select how to run the MCP server:"
          options={[
            {
              label: 'MCP Gateway (SSE) - Connect to Docker MCP Gateway',
              value: 'gateway',
            },
            {
              label: 'uvx (Python) - Spawns mcp-obsidian via uvx',
              value: 'uvx',
            },
            {
              label: 'Docker - Runs mcp-obsidian in a Docker container',
              value: 'docker',
            },
          ]}
          onSelect={(value) => {
            onSave({
              mcp: {
                ...mcpConfig,
                transportMode: value as MCPTransportMode,
              },
            })
            setView('mcp')
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>
            Gateway: Connect to Docker MCP Gateway running on Windows.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            uvx: Requires Python and uv installed locally.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            Docker: Requires Docker accessible from this environment.
          </Text>
        </Box>
      </SettingsContainer>
    )
  }

  // MCP Gateway URL input view
  if (view === 'mcp-gateway-url') {
    return (
      <SettingsContainer title="MCP Gateway URL" onBack={() => setView('mcp')}>
        <TextInput
          label="Enter MCP Gateway URL:"
          value={tempGatewayUrl}
          onChange={setTempGatewayUrl}
          placeholder={gatewayConfig?.url ?? 'http://localhost:8811/sse'}
          onSubmit={(value) => {
            const trimmed = value.trim()
            if (trimmed) {
              onSave({
                mcp: {
                  ...mcpConfig,
                  gateway: {
                    ...gatewayConfig,
                    url: trimmed,
                  },
                },
              })
            }
            setView('mcp')
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>
            URL of the Docker MCP Gateway SSE endpoint.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            Default: http://localhost:8811/sse
          </Text>
        </Box>
      </SettingsContainer>
    )
  }

  // MCP Docker image input view
  if (view === 'mcp-docker-image') {
    return (
      <SettingsContainer title="Docker Image" onBack={() => setView('mcp')}>
        <TextInput
          label="Enter Docker image name for mcp-obsidian:"
          value={tempDockerImage}
          onChange={setTempDockerImage}
          placeholder={dockerConfig?.imageName ?? 'mcp/obsidian'}
          onSubmit={(value) => {
            const trimmed = value.trim()
            if (trimmed) {
              onSave({
                mcp: {
                  ...mcpConfig,
                  docker: {
                    ...dockerConfig,
                    imageName: trimmed,
                  },
                },
              })
            }
            setView('mcp')
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>
            The Docker image containing the mcp-obsidian server.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            Example: mcp/obsidian, ghcr.io/org/mcp-obsidian
          </Text>
        </Box>
      </SettingsContainer>
    )
  }

  // MCP host input view
  if (view === 'mcp-host') {
    return (
      <SettingsContainer title="MCP Host" onBack={() => setView('mcp')}>
        <TextInput
          label="Enter Obsidian REST API host:"
          value={tempMCPHost}
          onChange={setTempMCPHost}
          placeholder={obsidianConfig.host}
          onSubmit={(value) => {
            const trimmed = value.trim()
            if (trimmed) {
              onSave({
                mcp: {
                  ...mcpConfig,
                  obsidian: {
                    ...obsidianConfig,
                    host: trimmed,
                  },
                },
              })
            }
            setView('mcp')
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>
            From WSL, use your Windows host IP (check /etc/resolv.conf).
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            Common values: 127.0.0.1 (local), host.docker.internal (Docker)
          </Text>
        </Box>
      </SettingsContainer>
    )
  }

  // MCP port input view
  if (view === 'mcp-port') {
    return (
      <SettingsContainer title="MCP Port" onBack={() => setView('mcp')}>
        <TextInput
          label="Enter Obsidian REST API port:"
          value={tempMCPPort}
          onChange={setTempMCPPort}
          placeholder={String(obsidianConfig.port)}
          onSubmit={(value) => {
            const trimmed = value.trim()
            const port = parseInt(trimmed, 10)
            if (!isNaN(port) && port > 0 && port < 65536) {
              onSave({
                mcp: {
                  ...mcpConfig,
                  obsidian: {
                    ...obsidianConfig,
                    port,
                  },
                },
              })
            }
            setView('mcp')
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>
            Default is 27124 (Obsidian Local REST API default).
          </Text>
        </Box>
      </SettingsContainer>
    )
  }

  // MCP API key env var input view
  if (view === 'mcp-apikey') {
    return (
      <SettingsContainer title="MCP API Key Env Var" onBack={() => setView('mcp')}>
        <TextInput
          label="Enter env variable name for Obsidian API key:"
          value={tempMCPApiKeyVar}
          onChange={setTempMCPApiKeyVar}
          placeholder={obsidianConfig.apiKeyEnvVar}
          onSubmit={(value) => {
            const trimmed = value.trim()
            if (trimmed) {
              onSave({
                mcp: {
                  ...mcpConfig,
                  obsidian: {
                    ...obsidianConfig,
                    apiKeyEnvVar: trimmed,
                  },
                },
              })
            }
            setView('mcp')
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>
            The API key value should be set in this environment variable.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            Get the key from Obsidian Local REST API plugin settings.
          </Text>
        </Box>
      </SettingsContainer>
    )
  }

  // MCP write mode selection view
  if (view === 'mcp-writemode') {
    return (
      <SettingsContainer title="MCP Write Mode" onBack={() => setView('mcp')}>
        <Select
          label="Select write safety mode:"
          options={[
            {
              label: 'Auto - Write directly without confirmation',
              value: 'auto',
            },
            {
              label: 'Confirm - Show preview before writing',
              value: 'confirm',
            },
            {
              label: 'Disabled - Read-only access',
              value: 'disabled',
            },
          ]}
          onSelect={(value) => {
            onSave({
              mcp: {
                ...mcpConfig,
                writeMode: value as MCPWriteMode,
              },
            })
            setView('mcp')
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>
            Controls how the AI handles vault file modifications.
          </Text>
        </Box>
      </SettingsContainer>
    )
  }

  // Main settings view - show EITHER Project Settings OR Global Settings
  if (hasProjectContext) {
    // Project Settings only
    return (
      <SettingsContainer
        title={`Project Settings: ${projectSettings?.projectName || 'Project'}`}
        onBack={onClose}
      >
        <Select
          label="Choose a setting to modify:"
          options={[
            {
              label: `AI Provider: ${projectOverrides.defaultProvider || `(${config.defaultProvider})`}`,
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
            label: `AI Provider: ${config.defaultProvider}`,
            value: 'provider',
          },
          { label: `Model: ${config.defaultModel}`, value: 'model' },
          { label: `API Key Env: ${config.apiKeyEnvVar}`, value: 'apikey' },
          {
            label: `Vault Path: ${config.vaultPath || 'Not set'}`,
            value: 'vault',
          },
          {
            label: `MCP: ${mcpConfig.enabled ? 'Enabled' : 'Disabled'}`,
            value: 'mcp',
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

