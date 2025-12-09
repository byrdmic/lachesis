import React from 'react'
import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'

type SelectOption = {
  label: string
  value: string
}

type SelectProps = {
  label: string
  options: SelectOption[]
  onSelect: (value: string) => void
  initialIndex?: number
}

export function Select({
  label,
  options,
  onSelect,
  initialIndex,
}: SelectProps) {
  const handleSelect = (item: { label: string; value: string }) => {
    onSelect(item.value)
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          {label}
        </Text>
      </Box>
      <SelectInput
        items={options}
        onSelect={handleSelect}
        initialIndex={initialIndex}
      />
    </Box>
  )
}
