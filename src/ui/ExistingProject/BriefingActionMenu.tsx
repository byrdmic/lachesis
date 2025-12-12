import React from 'react'
import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import type { LoadProjectAction } from '../../core/project/context.ts'

type BriefingActionMenuProps = {
  actions: LoadProjectAction[]
  onSelect: (action: LoadProjectAction) => void
  isActive?: boolean
}

/**
 * Renders a selectable menu of actions from the AI briefing
 */
export function BriefingActionMenu({
  actions,
  onSelect,
  isActive = true,
}: BriefingActionMenuProps) {
  const items = actions.map((action) => ({
    label: action.label,
    value: action.id,
  }))

  const handleSelect = (item: { label: string; value: string }) => {
    const selected = actions.find((a) => a.id === item.value)
    if (selected) {
      onSelect(selected)
    }
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text dimColor>What would you like to do?</Text>
      </Box>
      <SelectInput
        items={items}
        onSelect={handleSelect}
        isFocused={isActive}
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
