import React, { useState } from 'react'
import { Box, Text } from 'ink'
import type { Question as QuestionType } from '../../core/interview/types.ts'
import { TextInput } from './TextInput.tsx'
import { Select } from './Select.tsx'

type QuestionProps = {
  question: QuestionType
  onAnswer: (questionId: string, value: string) => void
}

export function Question({ question, onAnswer }: QuestionProps) {
  const [textValue, setTextValue] = useState('')

  if (question.type === 'select' && question.options) {
    return (
      <Select
        label={question.text}
        options={question.options}
        onSelect={(value) => onAnswer(question.id, value)}
      />
    )
  }

  // Default to text input
  return (
    <TextInput
      label={question.text}
      value={textValue}
      onChange={setTextValue}
      onSubmit={(value) => {
        onAnswer(question.id, value)
        setTextValue('')
      }}
      required={question.required}
    />
  )
}
