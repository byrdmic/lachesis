import React from "react";
import { Box, Text } from "ink";
import type { LachesisConfig } from "../../config/types.ts";
import { isAIAvailable } from "../../ai/client.ts";

type StatusBarProps = {
  config: LachesisConfig;
  onSettingsPress?: () => void;
};

export function StatusBar({ config, onSettingsPress }: StatusBarProps) {
  const aiConnected = isAIAvailable(config);

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text dimColor>AI: </Text>
        {aiConnected ? (
          <Text color="green">Connected ({config.defaultProvider})</Text>
        ) : (
          <Text color="yellow">Not configured</Text>
        )}
      </Box>
      <Box>
        <Text dimColor>[S] Settings</Text>
      </Box>
    </Box>
  );
}

type AIStatusProps = {
  config: LachesisConfig;
};

export function AIStatus({ config }: AIStatusProps) {
  const aiConnected = isAIAvailable(config);

  return (
    <Box>
      <Text dimColor>AI: </Text>
      {aiConnected ? (
        <Text color="green">Connected ({config.defaultProvider}/{config.defaultModel})</Text>
      ) : (
        <Text color="yellow">Not configured (set {config.apiKeyEnvVar})</Text>
      )}
    </Box>
  );
}
