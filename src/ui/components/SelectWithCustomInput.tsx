import React, { useState, useCallback, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import InkTextInput from 'ink-text-input'

export type SelectOption = {
  label: string
  value: string
}

type SelectWithCustomInputProps = {
  options: SelectOption[]
  onSelect: (value: string, isCustom: boolean) => void
  isFocused?: boolean
  customInputPlaceholder?: string
  /**
   * Callback to notify parent when the custom input is active (capturing all keyboard input).
   * Parent should disable their keyboard shortcuts when this is true.
   */
  onCustomInputActiveChange?: (isActive: boolean) => void
}

/**
 * A selection component that includes a custom text input option at the end.
 *
 * Behavior:
 * - Arrow up/down navigates between options
 * - When the custom input option is selected, typing fills in the custom value
 * - Pressing Escape or arrow keys while on custom input navigates away and re-enables shortcuts
 * - Enter submits the selected option or custom text
 */
export function SelectWithCustomInput({
  options,
  onSelect,
  isFocused = true,
  customInputPlaceholder = 'Type your own response...',
  onCustomInputActiveChange,
}: SelectWithCustomInputProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [customValue, setCustomValue] = useState('')

  // Total options = provided options + 1 custom input option
  const totalOptions = options.length + 1
  const isOnCustomInput = selectedIndex === options.length

  // Notify parent when custom input becomes active/inactive
  useEffect(() => {
    onCustomInputActiveChange?.(isOnCustomInput && isFocused)
  }, [isOnCustomInput, isFocused, onCustomInputActiveChange])

  const handleSelect = useCallback(() => {
    if (isOnCustomInput) {
      if (customValue.trim()) {
        onSelect(customValue.trim(), true)
      }
    } else {
      const option = options[selectedIndex]
      if (option) {
        onSelect(option.value, false)
      }
    }
  }, [selectedIndex, options, customValue, onSelect, isOnCustomInput])

  const navigateUp = useCallback(() => {
    setSelectedIndex((idx) => Math.max(0, idx - 1))
  }, [])

  const navigateDown = useCallback(() => {
    setSelectedIndex((idx) => Math.min(totalOptions - 1, idx + 1))
  }, [totalOptions])

  useInput(
    (input, key) => {
      // When on custom input and typing, only respond to escape and arrow keys
      if (isOnCustomInput) {
        if (key.escape) {
          // Navigate up from custom input
          if (selectedIndex > 0) {
            navigateUp()
          }
          return
        }
        if (key.upArrow) {
          navigateUp()
          return
        }
        if (key.downArrow) {
          // Already at the bottom, do nothing
          return
        }
        if (key.return && customValue.trim()) {
          handleSelect()
          return
        }
        // Let text input handle other keys
        return
      }

      // Normal option navigation
      if (key.upArrow) {
        navigateUp()
      } else if (key.downArrow) {
        navigateDown()
      } else if (key.return) {
        handleSelect()
      }
    },
    { isActive: isFocused },
  )

  return (
    <Box flexDirection="column">
      {options.map((option, idx) => {
        const isSelected = idx === selectedIndex
        return (
          <Box key={option.value}>
            <Text color={isSelected ? 'cyan' : undefined}>
              {isSelected ? '❯ ' : '  '}
              {option.label}
            </Text>
          </Box>
        )
      })}

      {/* Custom input option */}
      <Box>
        <Text color={isOnCustomInput ? 'cyan' : undefined}>
          {isOnCustomInput ? '❯ ' : '  '}
        </Text>
        {isOnCustomInput ? (
          <InkTextInput
            value={customValue}
            onChange={setCustomValue}
            onSubmit={() => {
              if (customValue.trim()) {
                handleSelect()
              }
            }}
            placeholder={customInputPlaceholder}
            focus={isFocused && isOnCustomInput}
          />
        ) : (
          <Text dimColor>{customInputPlaceholder}</Text>
        )}
      </Box>
    </Box>
  )
}
