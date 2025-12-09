import React, { useState } from "react";
import { Box, Text } from "ink";
import { Select } from "../components/Select.tsx";
import { TextInput } from "../components/TextInput.tsx";
import type {
  InterviewDepth,
  QuestionMode,
  PlanningLevel,
} from "../../core/project/types.ts";

type SetupPhaseProps = {
  onComplete: (
    planningLevel: PlanningLevel,
    depth: InterviewDepth,
    mode: QuestionMode,
    projectName: string,
    oneLiner: string
  ) => void;
  onCancel: () => void;
};

type SetupStep = "planning" | "depth" | "mode" | "name" | "oneliner";

export function SetupPhase({ onComplete, onCancel }: SetupPhaseProps) {
  const [step, setStep] = useState<SetupStep>("planning");
  const [planningLevel, setPlanningLevel] = useState<PlanningLevel | null>(null);
  const [depth, setDepth] = useState<InterviewDepth | null>(null);
  const [mode, setMode] = useState<QuestionMode | null>(null);
  const [projectName, setProjectName] = useState("");
  const [oneLiner, setOneLiner] = useState("");

  const handlePlanningSelect = (value: string) => {
    setPlanningLevel(value as PlanningLevel);
    setStep("depth");
  };

  const handleDepthSelect = (value: string) => {
    setDepth(value as InterviewDepth);
    setStep("mode");
  };

  const handleModeSelect = (value: string) => {
    setMode(value as QuestionMode);
    setStep("name");
  };

  const handleNameSubmit = (value: string) => {
    setProjectName(value);
    setStep("oneliner");
  };

  const handleOneLinerSubmit = (value: string) => {
    if (planningLevel && depth && mode && projectName) {
      onComplete(planningLevel, depth, mode, projectName, value);
    }
  };

  // Build context string showing previous selections
  const contextParts: string[] = [];
  if (planningLevel) contextParts.push(formatPlanningLevel(planningLevel));
  if (depth) contextParts.push(depth);
  if (mode) contextParts.push(mode);
  if (projectName) contextParts.push(`"${projectName}"`);
  const contextString = contextParts.join(" | ");

  return (
    <Box flexDirection="column" padding={1}>
      <Box
        borderStyle="double"
        borderColor="cyan"
        paddingX={3}
        paddingY={1}
        marginBottom={1}
      >
        <Text color="cyan" bold>
          Lachesis Project Foundations Studio
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>Before we begin, let me understand where you're starting from.</Text>
      </Box>

      {step === "planning" && (
        <Select
          label="How much of this idea have you already planned out?"
          options={[
            { label: "Vague idea - Just a spark", value: "vague_idea" },
            { label: "Some notes - Partial thoughts", value: "some_notes" },
            { label: "Well defined - Clear picture", value: "well_defined" },
          ]}
          onSelect={handlePlanningSelect}
        />
      )}

      {step === "depth" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>{contextString}</Text>
          </Box>
          <Select
            label="How deep do you want to go today?"
            options={[
              { label: "Short - Quick overview (core questions only)", value: "short" },
              { label: "Medium - Balanced exploration", value: "medium" },
              { label: "Deep - Thorough examination", value: "deep" },
            ]}
            onSelect={handleDepthSelect}
          />
        </Box>
      )}

      {step === "mode" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>{contextString}</Text>
          </Box>
          <Select
            label="Do you prefer one question at a time, or a small batch at once?"
            options={[
              { label: "Single - One at a time (recommended)", value: "single" },
              { label: "Batch - Small groups of 2-3", value: "batch" },
            ]}
            onSelect={handleModeSelect}
          />
        </Box>
      )}

      {step === "name" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>{contextString}</Text>
          </Box>
          <TextInput
            label="What's the working name for this project?"
            value={projectName}
            onChange={setProjectName}
            onSubmit={handleNameSubmit}
            placeholder="e.g., TaskFlow, MyApp, Project X"
            required
          />
        </Box>
      )}

      {step === "oneliner" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>{contextString}</Text>
          </Box>
          <TextInput
            label="Give me the one-liner: what does this project do?"
            value={oneLiner}
            onChange={setOneLiner}
            onSubmit={handleOneLinerSubmit}
            placeholder="e.g., A CLI tool that helps developers manage tasks"
            required
          />
        </Box>
      )}
    </Box>
  );
}

function formatPlanningLevel(level: PlanningLevel): string {
  switch (level) {
    case "vague_idea":
      return "Vague idea";
    case "some_notes":
      return "Some notes";
    case "well_defined":
      return "Well defined";
  }
}
