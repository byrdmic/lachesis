import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { Select } from "./Select.tsx";
import { TextInput } from "./TextInput.tsx";
import type { LachesisConfig, AIProvider } from "../../config/types.ts";
import { isAIAvailable } from "../../ai/client.ts";

type SettingsPanelProps = {
  config: LachesisConfig;
  onSave: (updates: Partial<LachesisConfig>) => void;
  onClose: () => void;
};

type SettingsView = "main" | "provider" | "model" | "apikey" | "depth" | "mode";

export function SettingsPanel({ config, onSave, onClose }: SettingsPanelProps) {
  const [view, setView] = useState<SettingsView>("main");
  const [tempModel, setTempModel] = useState(config.defaultModel);
  const [tempApiKeyVar, setTempApiKeyVar] = useState(config.apiKeyEnvVar);

  // Reset temp values when view changes
  useEffect(() => {
    if (view === "model") {
      setTempModel(config.defaultModel);
    } else if (view === "apikey") {
      setTempApiKeyVar(config.apiKeyEnvVar);
    }
  }, [view, config.defaultModel, config.apiKeyEnvVar]);

  const aiConnected = isAIAvailable(config);

  useInput((input, key) => {
    if (key.escape) {
      if (view === "main") {
        onClose();
      } else {
        setView("main");
      }
    }
  });

  if (view === "provider") {
    return (
      <SettingsContainer title="AI Provider" onBack={() => setView("main")}>
        <Select
          label="Select AI provider:"
          options={[
            { label: "OpenAI", value: "openai" },
            { label: "Anthropic", value: "anthropic" },
            { label: "Vertex AI", value: "vertex" },
            { label: "Other", value: "other" },
          ]}
          onSelect={(value) => {
            onSave({ defaultProvider: value as AIProvider });
            setView("main");
          }}
        />
      </SettingsContainer>
    );
  }

  if (view === "model") {
    return (
      <SettingsContainer title="Model Name" onBack={() => setView("main")}>
        <TextInput
          label="Enter model name (e.g., gpt-4, claude-3-opus):"
          value={tempModel}
          onChange={setTempModel}
          placeholder={config.defaultModel}
          onSubmit={(value) => {
            if (value.trim()) {
              onSave({ defaultModel: value.trim() });
            }
            setView("main");
          }}
        />
      </SettingsContainer>
    );
  }

  if (view === "apikey") {
    return (
      <SettingsContainer title="API Key Environment Variable" onBack={() => setView("main")}>
        <TextInput
          label="Enter env variable name for API key:"
          value={tempApiKeyVar}
          onChange={setTempApiKeyVar}
          placeholder={config.apiKeyEnvVar}
          onSubmit={(value) => {
            if (value.trim()) {
              onSave({ apiKeyEnvVar: value.trim() });
            }
            setView("main");
          }}
        />
      </SettingsContainer>
    );
  }

  if (view === "depth") {
    return (
      <SettingsContainer title="Default Interview Depth" onBack={() => setView("main")}>
        <Select
          label="Select default interview depth:"
          options={[
            { label: "Short (quick overview)", value: "short" },
            { label: "Medium (balanced)", value: "medium" },
            { label: "Deep (comprehensive)", value: "deep" },
          ]}
          onSelect={(value) => {
            onSave({ defaultInterviewDepth: value as "short" | "medium" | "deep" });
            setView("main");
          }}
        />
      </SettingsContainer>
    );
  }

  if (view === "mode") {
    return (
      <SettingsContainer title="Default Question Mode" onBack={() => setView("main")}>
        <Select
          label="Select default question mode:"
          options={[
            { label: "Single (one at a time)", value: "single" },
            { label: "Batch (grouped questions)", value: "batch" },
          ]}
          onSelect={(value) => {
            onSave({ defaultQuestionMode: value as "single" | "batch" });
            setView("main");
          }}
        />
      </SettingsContainer>
    );
  }

  // Main settings view
  return (
    <SettingsContainer title="Settings" onBack={onClose}>
      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>AI Status: </Text>
        {aiConnected ? (
          <Text color="green">Connected</Text>
        ) : (
          <Text color="yellow">Not configured</Text>
        )}
      </Box>

      <Select
        label="Choose a setting to modify:"
        options={[
          { label: `AI Provider: ${config.defaultProvider}`, value: "provider" },
          { label: `Model: ${config.defaultModel}`, value: "model" },
          { label: `API Key Env: ${config.apiKeyEnvVar}`, value: "apikey" },
          { label: `Interview Depth: ${config.defaultInterviewDepth}`, value: "depth" },
          { label: `Question Mode: ${config.defaultQuestionMode}`, value: "mode" },
          { label: "Close settings", value: "close" },
        ]}
        onSelect={(value) => {
          if (value === "close") {
            onClose();
          } else {
            setView(value as SettingsView);
          }
        }}
      />

      <Box marginTop={1}>
        <Text dimColor>Press Esc to close</Text>
      </Box>
    </SettingsContainer>
  );
}

type SettingsContainerProps = {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
};

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
  );
}
