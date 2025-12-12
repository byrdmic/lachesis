import React from 'react'
import { Box, Text } from 'ink'
import { SelectWithCustomInput } from '../components/SelectWithCustomInput.tsx'
import type { LoadProjectAction } from '../../core/project/context.ts'

type BriefingActionMenuProps = {
  actions: LoadProjectAction[]
  onSelect: (action: LoadProjectAction) => void
  onCustomInput?: (input: string) => void
  isActive?: boolean
  /**
   * Callback when custom input is actively capturing keyboard input.
   * Parent should disable shortcuts when true.
   */
  onCustomInputActiveChange?: (isActive: boolean) => void
}

/**
 * Renders a selectable menu of actions from the AI briefing,
 * with a custom text input option at the end.
 */
export function BriefingActionMenu({
  actions,
  onSelect,
  onCustomInput,
  isActive = true,
  onCustomInputActiveChange,
}: BriefingActionMenuProps) {
  const options = actions.map((action) => ({
    label: action.label,
    value: action.id,
  }))

  const handleSelect = (value: string, isCustom: boolean) => {
    if (isCustom) {
      onCustomInput?.(value)
    } else {
      const selected = actions.find((a) => a.id === value)
      if (selected) {
        onSelect(selected)
      }
    }
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text dimColor>What would you like to do?</Text>
      </Box>
      <SelectWithCustomInput
        options={options}
        onSelect={handleSelect}
        isFocused={isActive}
        customInputPlaceholder="Or tell me something else..."
        onCustomInputActiveChange={onCustomInputActiveChange}
      />
      <Box marginTop={1} flexDirection="column">
        {actions.map((action) => (
          <Text key={action.id} dimColor>
            {action.label}: {action.description}
          </Text>
        ))}
      </Box>
    </Box>
  )
}
