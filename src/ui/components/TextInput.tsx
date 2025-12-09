import React from 'react'
import { Box, Text } from 'ink'
import InkTextInput from 'ink-text-input'

type TextInputProps = {
  label: string
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  placeholder?: string
  required?: boolean
}

export function TextInput({
  label,
  value,
  onChange,
  onSubmit,
  placeholder,
  required,
}: TextInputProps) {
  const handleSubmit = (val: string) => {
    // If required and empty, don't submit
    if (required && val.trim() === '') {
      return
    }
    onSubmit(val)
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan" bold>
          {label}
        </Text>
        {required && <Text color="red"> *</Text>}
      </Box>
      <Box marginTop={1}>
        <Text color="gray">{'❯ '}</Text>
        <InkTextInput
          value={value}
          onChange={onChange}
          onSubmit={handleSubmit}
          placeholder={placeholder ?? 'Type your answer...'}
        />
      </Box>
    </Box>
  )
}
