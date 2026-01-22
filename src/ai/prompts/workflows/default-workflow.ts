// Default workflow section builder for generic workflows

import type { WorkflowDefinition } from '../../../core/workflows/types'

export function buildDefaultWorkflowSection(
  workflow: WorkflowDefinition,
  workflowFileContents: string
): string {
  // Tool-based instructions for workflows
  const toolInstructions = workflow.confirmation !== 'none' ? `

FILE MODIFICATIONS:
You have access to Edit and Write tools for modifying project files.
- Use the Edit tool to apply changes to existing files (provide file path and the text to replace)
- Use the Write tool to create new files or fully replace file content
- The file contents are provided below - use them to understand current state
- For multi-file operations, use multiple tool calls

ARCHIVE FORMAT (when archiving tasks):
- Add date-stamped section header: ### YYYY-MM-DD
- Include brief 1-3 sentence summary of what was completed
- Preserve key context from the original task
` : ''

  return `
================================================================================
ACTIVE WORKFLOW: ${workflow.displayName.toUpperCase()}
================================================================================
Intent: ${workflow.intent}

Risk: ${workflow.risk} | Confirmation: ${workflow.confirmation}
May read: ${workflow.readFiles.join(', ')}
May write: ${workflow.writeFiles.join(', ')}
May delete content: ${workflow.allowsDelete ? 'yes' : 'no'}
May move between files: ${workflow.allowsCrossFileMove ? 'yes' : 'no'}

RULES FOR THIS WORKFLOW:
${workflow.rules.map((r) => `• ${r}`).join('\n')}
${toolInstructions}
FILE CONTENTS (for workflow execution):
${workflowFileContents}
================================================================================
`
}
