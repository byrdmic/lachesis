import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { Select } from '../components/Select.tsx'
import { TextInput } from '../components/TextInput.tsx'
import type { InterviewDepth, PlanningLevel } from '../../core/project/types.ts'

type SetupPhaseProps = {
  onComplete: (
    planningLevel: PlanningLevel,
    depth: InterviewDepth,
    projectName: string,
    oneLiner: string,
  ) => void
  onCancel: () => void
  onInputModeChange?: (typing: boolean) => void
}

type SetupStep =
  | 'planning'
  | 'planning_custom'
  | 'depth'
  | 'depth_custom'
  | 'name'
  | 'oneliner'

export function SetupPhase({
  onComplete,
  onCancel,
  onInputModeChange,
}: SetupPhaseProps) {
  const [step, setStep] = useState<SetupStep>('planning')
  const [planningLevel, setPlanningLevel] = useState<PlanningLevel | null>(null)
  const [planningCustom, setPlanningCustom] = useState('')
  const [planningInitialIndex, setPlanningInitialIndex] = useState(0)
  const [depth, setDepth] = useState<InterviewDepth | null>(null)
  const [depthCustom, setDepthCustom] = useState('')
  const [depthInitialIndex, setDepthInitialIndex] = useState(0)
  const [projectName, setProjectName] = useState('')
  const [oneLiner, setOneLiner] = useState('')

  const typing =
    step === 'planning_custom' ||
    step === 'depth_custom' ||
    step === 'name' ||
    step === 'oneliner'

  React.useEffect(() => {
    onInputModeChange?.(typing)
    return () => onInputModeChange?.(false)
  }, [typing, onInputModeChange])

  // Escape from custom inputs returns to list with the prior option highlighted
  useInput(
    (input, key) => {
      if (!key.escape) return
      if (step === 'planning_custom') {
        setPlanningCustom('')
        setPlanningInitialIndex(2) // last preset before "Enter your own"
        setStep('planning')
      } else if (step === 'depth_custom') {
        setDepthCustom('')
        setDepthInitialIndex(2)
        setStep('depth')
      }
    },
    { isActive: step === 'planning_custom' || step === 'depth_custom' },
  )

  const handlePlanningSelect = (value: string) => {
    if (value === 'Enter your own') {
      setPlanningInitialIndex(2) // fallback highlight when returning
      setStep('planning_custom')
      return
    }
    setPlanningLevel(value as PlanningLevel)
    setPlanningInitialIndex(0)
    setStep('depth')
  }

  const handleDepthSelect = (value: string) => {
    if (value === 'Enter your own') {
      setDepthInitialIndex(2)
      setStep('depth_custom')
      return
    }
    setDepth(value as InterviewDepth)
    setDepthInitialIndex(0)
    setStep('name')
  }

  const handleNameSubmit = (value: string) => {
    setProjectName(value)
    setStep('oneliner')
  }

  const handleOneLinerSubmit = (value: string) => {
    if (planningLevel && depth) {
      onComplete(
        planningLevel,
        depth,
        projectName.trim(),
        value,
      )
    }
  }

  // Build context string showing previous selections
  const contextParts: string[] = []
  if (planningLevel) contextParts.push(planningLevel)
  if (depth) contextParts.push(depth)
  if (projectName) contextParts.push(`"${projectName}"`)
  const contextString = contextParts.join(' | ')

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
        <Text>
          Before we begin, let me understand where you're starting from.
        </Text>
      </Box>

      {step === 'planning' && (
        <Select
          label="How much of this idea have you already planned out?"
          options={[
            { label: 'Light - Just a spark', value: 'Light - Just a spark' },
            { label: 'Medium - Some notes', value: 'Medium - Some notes' },
            { label: 'Heavy - Well defined', value: 'Heavy - Well defined' },
            { label: 'Enter your own', value: 'Enter your own' },
          ]}
          initialIndex={planningInitialIndex}
          onSelect={handlePlanningSelect}
        />
      )}

      {step === 'depth' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>{contextString}</Text>
          </Box>
          <Select
            label="How deep do you want to go today?"
            options={[
              {
                label: 'Light - Quick skim (core questions only)',
                value: 'Light - Quick skim',
              },
              { label: 'Medium - Balanced exploration', value: 'Medium - Balanced' },
              { label: 'Heavy - Deep dive', value: 'Heavy - Deep dive' },
              { label: 'Enter your own', value: 'Enter your own' },
            ]}
            initialIndex={depthInitialIndex}
            onSelect={handleDepthSelect}
          />
        </Box>
      )}

      {step === 'planning_custom' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>{contextString || 'Your words go here'}</Text>
          </Box>
          <TextInput
            label="Tell me where you are with this idea (freeform welcome)"
            value={planningCustom}
            onChange={setPlanningCustom}
            onSubmit={(val) => {
              const v = val.trim()
              if (v) {
                setPlanningLevel(v)
                setPlanningCustom(v)
                setPlanningInitialIndex(2) // return focus to last preset before custom
                setStep('depth')
              }
            }}
            placeholder="e.g., I have a rough storyboard and a few notes"
          />
          <Box marginTop={1}>
            <Text dimColor>Optional — whatever you share helps the AI adapt.</Text>
          </Box>
        </Box>
      )}

      {step === 'depth_custom' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>{contextString}</Text>
          </Box>
          <TextInput
            label="Describe how in-depth you want to go (freeform welcome)"
            value={depthCustom}
            onChange={setDepthCustom}
            onSubmit={(val) => {
              const v = val.trim()
              if (v) {
                setDepth(v)
                setDepthCustom(v)
                setDepthInitialIndex(2) // return focus to last preset before custom
                setStep('name')
              }
            }}
            placeholder="e.g., Just a skim, or deep planning of risks"
          />
          <Box marginTop={1}>
            <Text dimColor>Optional — say whatever sets the right depth for you.</Text>
          </Box>
        </Box>
      )}

      {step === 'name' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>{contextString}</Text>
          </Box>
          <TextInput
            label="What's the working name for this project? (optional)"
            value={projectName}
            onChange={setProjectName}
            onSubmit={handleNameSubmit}
            placeholder="Feel free to skip — we can name it later"
          />
          <Box marginTop={1}>
            <Text dimColor>It's totally fine if you don't have a name yet.</Text>
          </Box>
        </Box>
      )}

      {step === 'oneliner' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>{contextString}</Text>
          </Box>
          <TextInput
            label="Do you have an idea about what you want this project to do? If you do, think about it and reduce it down to one line and type that here."
            value={oneLiner}
            onChange={setOneLiner}
            onSubmit={handleOneLinerSubmit}
            placeholder="e.g., A CLI tool that helps developers manage tasks"
            required={false}
          />
          <Box marginTop={1}>
            <Text dimColor>
              Structured format we send to the AI:
              {' '}
              planning_level, depth, working_name (optional), one_liner.
            </Text>
            <Text dimColor>
              If anything is blank, we'll tell the AI it's okay and keep going.
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}
