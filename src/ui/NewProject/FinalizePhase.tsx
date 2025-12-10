import React, { useState, useCallback } from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import type { LachesisConfig } from '../../config/types.ts'
import type { Answer } from '../../core/interview/types.ts'
import type {
  PlanningLevel,
  SessionLogEntry,
} from '../../core/project/types.ts'
import type {
  ConversationMessage,
  ExtractedProjectData,
} from '../../ai/client.ts'
import { Select } from '../components/index.ts'
import { buildProjectDefinition } from '../../core/project/builder.ts'
import { scaffoldProject } from '../../fs/scaffolder.ts'

type FinalizePhaseProps = {
  config: LachesisConfig
  planningLevel: PlanningLevel
  projectName: string
  oneLiner: string
  // New AI-based data
  extractedData?: ExtractedProjectData
  conversationLog: ConversationMessage[]
  // Legacy support
  answers?: Map<string, Answer>
  sessionLog?: SessionLogEntry[]
  onComplete: (projectPath: string) => void
  onCancel: () => void
}

type FinalizeStep = 'confirm' | 'scaffolding' | 'done' | 'error'

export function FinalizePhase({
  config,
  planningLevel,
  projectName,
  oneLiner,
  extractedData,
  conversationLog,
  answers,
  sessionLog,
  onComplete,
  onCancel,
}: FinalizePhaseProps) {
  const [step, setStep] = useState<FinalizeStep>('confirm')
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = useCallback(
    async (value: string) => {
      if (value !== 'yes') {
        onCancel()
        return
      }

      setStep('scaffolding')

      try {
        const effectiveName =
          projectName.trim() ||
          oneLiner.trim() ||
          `Untitled Project ${new Date().toISOString().slice(0, 10)}`

        // Build the project definition based on available data
        let projectDef

        if (extractedData) {
          // New AI-based input
          projectDef = buildProjectDefinition({
            name: effectiveName,
            planningLevel,
            extractedData,
            conversationLog,
          })
        } else if (answers && sessionLog) {
          // Legacy answer-based input
          projectDef = buildProjectDefinition({
            name: effectiveName,
            planningLevel,
            answers,
            sessionLog,
          })
        } else {
          throw new Error('No project data available')
        }

        // Scaffold the project
        const result = await scaffoldProject(config.vaultPath, projectDef)

        if (result.success) {
          setStep('done')
          onComplete(result.projectPath!)
        } else {
          setError(result.error ?? 'Unknown error')
          setStep('error')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setStep('error')
      }
    },
    [
      config,
      projectName,
      planningLevel,
      extractedData,
      conversationLog,
      answers,
      sessionLog,
      onComplete,
      onCancel,
    ],
  )

  if (step === 'confirm') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box
          borderStyle="round"
          borderColor="green"
          paddingX={2}
          paddingY={1}
          marginBottom={1}
        >
          <Text color="green" bold>
            Planning conversation complete
          </Text>
        </Box>

        {/* Show summary if available */}
        {extractedData && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>Project: {projectName || 'Untitled Project'}</Text>
            <Text dimColor>{extractedData.vision.oneLinePitch}</Text>
            {extractedData.vision.primaryAudience && (
              <Text dimColor>For: {extractedData.vision.primaryAudience}</Text>
            )}
          </Box>
        )}

        <Select
          label="Ready to create your project files?"
          options={[
            { label: 'Yes, create my project', value: 'yes' },
            { label: 'No, exit without saving', value: 'no' },
          ]}
          onSelect={handleConfirm}
        />

        <Box marginTop={1}>
          <Text dimColor>
            Files will be created in: {config.vaultPath}/
            {projectName || 'untitled-project'}
          </Text>
        </Box>
      </Box>
    )
  }

  if (step === 'scaffolding') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Creating project structure...</Text>
        </Box>
      </Box>
    )
  }

  if (step === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>
          Error creating project:
        </Text>
        <Text color="red">{error}</Text>
      </Box>
    )
  }

  // Done step is handled by parent
  return null
}
