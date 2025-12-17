import React, { useEffect } from 'react'
import { Box, Text } from 'ink'
import type { ExtractedProjectData } from '../../ai/client.ts'

type QuickCapturePhaseProps = {
  projectName: string
  oneLiner: string
  onComplete: (data: ExtractedProjectData) => void
}

/**
 * Quick capture phase - placeholder for future implementation.
 * Currently auto-completes with minimal data.
 */
export function QuickCapturePhase({
  projectName,
  oneLiner,
  onComplete,
}: QuickCapturePhaseProps) {
  useEffect(() => {
    const minimalData: ExtractedProjectData = {
      vision: {
        oneLinePitch: oneLiner,
        description: oneLiner,
        primaryAudience: 'To be defined',
        problemSolved: 'To be defined',
        successCriteria: 'To be defined',
      },
      constraints: {
        known: [],
        assumptions: [],
        risks: [],
        antiGoals: [],
      },
      execution: {},
    }

    // Auto-complete for now - can enhance later with actual form
    const timer = setTimeout(() => onComplete(minimalData), 100)
    return () => clearTimeout(timer)
  }, [oneLiner, onComplete])

  return (
    <Box flexDirection="column" padding={1}>
      <Text>Quick capture for {projectName}...</Text>
    </Box>
  )
}
