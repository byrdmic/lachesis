// Default workflow section builder for generic workflows

import type { WorkflowDefinition } from '../../../core/workflows/types'

export function buildDefaultWorkflowSection(
  workflow: WorkflowDefinition,
  workflowFileContents: string
): string {
  // Add diff format instructions for workflows that need preview/confirm
  const diffInstructions = workflow.confirmation !== 'none' ? `

OUTPUT FORMAT FOR CHANGES (CRITICAL):
When you have changes to propose, output them in unified diff format inside a diff code block.
Each file change should be in its own diff block with clear file headers.

CRITICAL: The lines marked with "-" (old content) MUST match EXACTLY what is currently in the file.
Do NOT show what you WANT the file to contain as the old content - show what it ACTUALLY contains.

Example 1 - Adding just a title:
\`\`\`diff
--- Log.md
+++ Log.md
@@ -5,4 +5,4 @@
 ## 2024-01-15

-11:48am
+11:48am - MCP Server
 I got the mcp server to actually work...
\`\`\`

Example 2 - Adding title AND potential tasks section (for refine-log workflow):
\`\`\`diff
--- Log.md
+++ Log.md
@@ -5,8 +5,14 @@
 ## 2024-01-15

-11:48am
+11:48am - MCP Server Setup
 I got the mcp server to actually work. Need to add it to the docker compose file
 and test the new endpoints. Also should document the configuration options.
+
+<!-- AI: potential-tasks start -->
+#### Potential tasks (AI-generated)
+- [ ] Add MCP server to docker compose
+- [ ] Test new endpoints
+- [ ] Document configuration options
+<!-- AI: potential-tasks end -->

 10:30am - Morning planning
\`\`\`

RULES FOR DIFF OUTPUT:
• Use exact unified diff format with --- and +++ headers
• Include @@ line number markers (use approximate line numbers)
• CRITICAL: The "-" lines must show the ACTUAL current content of the file
• The "+" lines show what the content should become AFTER your changes
• Include 1-2 lines of context around each change (lines starting with space)
• Only show the changed sections, not entire files
• Each file gets its own \`\`\`diff block
• After showing all diffs, briefly explain what each change does
• The user will see Accept/Reject buttons for each diff block
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
${diffInstructions}
FILE CONTENTS (for workflow execution):
${workflowFileContents}
================================================================================
`
}
