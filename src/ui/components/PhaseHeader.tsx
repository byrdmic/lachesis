import React from "react";
import { Box, Text } from "ink";

type PhaseHeaderProps = {
  phaseNumber: number;
  phaseName: string;
  description: string;
  totalPhases?: number;
};

export function PhaseHeader({
  phaseNumber,
  phaseName,
  description,
  totalPhases = 5,
}: PhaseHeaderProps) {
  // Create progress indicator
  const progress = Array.from({ length: totalPhases }, (_, i) =>
    i < phaseNumber ? "●" : "○"
  ).join(" ");

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      marginBottom={1}
    >
      <Box justifyContent="space-between">
        <Text color="cyan" bold>
          Phase {phaseNumber}: {phaseName}
        </Text>
        <Text dimColor>{progress}</Text>
      </Box>
      <Text dimColor>{description}</Text>
    </Box>
  );
}
