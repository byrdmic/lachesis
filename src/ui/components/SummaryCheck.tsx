import React from "react";
import { Box, Text } from "ink";
import { Select } from "./Select.tsx";

type AnswerSummary = {
  question: string;
  answer: string;
};

type SummaryCheckProps = {
  question: string;
  answers?: AnswerSummary[];
  onConfirm: (confirmed: boolean) => void;
};

export function SummaryCheck({ question, answers, onConfirm }: SummaryCheckProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box
        borderStyle="single"
        borderColor="yellow"
        paddingX={2}
        paddingY={1}
        marginBottom={1}
      >
        <Text color="yellow">Summary Check</Text>
      </Box>

      {answers && answers.length > 0 && (
        <Box flexDirection="column" marginBottom={1} paddingX={1}>
          <Text dimColor>Your responses:</Text>
          <Box flexDirection="column" marginTop={1}>
            {answers.map((item, index) => (
              <Box key={index} flexDirection="column" marginBottom={1}>
                <Text dimColor>{item.question}</Text>
                <Text color="white">{item.answer}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Select
        label={question}
        options={[
          { label: "Yes, looks good", value: "yes" },
          { label: "Let's refine it", value: "no" },
        ]}
        onSelect={(value) => onConfirm(value === "yes")}
      />
    </Box>
  );
}
