import React from 'react'
import { Box, Text } from 'ink'
import type { AIBriefingResponse } from '../../ai/client.ts'

type ProjectBriefingCardProps = {
  briefing: AIBriefingResponse
}

/**
 * Renders the AI-generated project briefing in a formatted card
 */
export function ProjectBriefingCard({ briefing }: ProjectBriefingCardProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Greeting */}
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          {briefing.greeting}
        </Text>
      </Box>

      {/* Re-orientation */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold dimColor>
          PROJECT
        </Text>
        <Box marginLeft={2}>
          <Text>{briefing.reorientation}</Text>
        </Box>
      </Box>

      {/* Recent Activity */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold dimColor>
          RECENT ACTIVITY
        </Text>
        <Box marginLeft={2}>
          <Text>{briefing.recentActivity}</Text>
        </Box>
      </Box>

      {/* Health Assessment */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold dimColor>
          STATUS
        </Text>
        <Box marginLeft={2}>
          <Text>{briefing.healthAssessment}</Text>
        </Box>
      </Box>

      {/* Recommendations */}
      {briefing.recommendations.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold dimColor>
            RECOMMENDATIONS
          </Text>
          <Box marginLeft={2} flexDirection="column">
            {briefing.recommendations.map((rec, idx) => (
              <Text key={idx}>• {rec}</Text>
            ))}
          </Box>
        </Box>
      )}

      {/* Question */}
      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow">{briefing.question}</Text>
      </Box>
    </Box>
  )
}
