/**
 * JSON Extractor Utility
 *
 * Extracts JSON from AI responses that may be wrapped in markdown code blocks.
 * Handles cases where the JSON content itself contains triple backticks.
 */

/**
 * Extract JSON from a response that may be wrapped in markdown code blocks.
 *
 * This handles the edge case where JSON content contains triple backticks
 * (e.g., task text like "Detect ```kos``` code blocks"). The naive regex
 * `/```(?:json)?\s*([\s\S]*?)```/` would match the wrong closing fence.
 *
 * Strategy:
 * 1. Try to parse content directly as JSON
 * 2. If that fails and content starts with ```, strip opening fence
 * 3. Find the closing fence from the END of the content (last ``` on its own line)
 */
export function extractJsonFromResponse(content: string): string {
  let jsonStr = content.trim()

  // Try to parse directly first (if AI returned raw JSON)
  try {
    JSON.parse(jsonStr)
    return jsonStr
  } catch {
    // Not valid JSON directly, try to extract from code block
  }

  // Check if content starts with a code fence
  if (jsonStr.startsWith('```')) {
    // Strip the opening fence line (```json or ```)
    const firstNewline = jsonStr.indexOf('\n')
    if (firstNewline !== -1) {
      jsonStr = jsonStr.substring(firstNewline + 1)
    }

    // Find the closing fence - look for ``` on its own line from the END
    // This handles cases where JSON content contains backticks
    const lines = jsonStr.split('\n')
    let closingIndex = -1
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() === '```') {
        closingIndex = i
        break
      }
    }

    if (closingIndex !== -1) {
      jsonStr = lines.slice(0, closingIndex).join('\n')
    }
  }

  return jsonStr.trim()
}
