// Template utilities - shared helper functions for template evaluation

// ============================================================================
// Common Placeholders
// ============================================================================

/**
 * Common placeholder patterns - kept minimal since templates are simplified.
 */
export const COMMON_PLACEHOLDERS: string[] = []

// ============================================================================
// Content Processing
// ============================================================================

/**
 * Strip YAML frontmatter from content.
 */
export function stripFrontmatter(content: string): { body: string } {
  const frontmatterRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/
  const match = content.match(frontmatterRegex)
  if (!match) return { body: content }
  return { body: content.slice(match[0].length) }
}

/**
 * Normalize text by converting CRLF to LF and trimming.
 */
export function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n').trim()
}

/**
 * Remove known placeholder patterns from text.
 */
export function stripPlaceholders(text: string, placeholders: string[]): string {
  let result = text
  for (const ph of placeholders) {
    // Remove both exact lines and inline occurrences
    const escaped = ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`^\\s*${escaped}\\s*$`, 'gmi'), '')
    result = result.replace(new RegExp(escaped, 'gmi'), '')
  }
  return result.trim()
}

/**
 * Count how many <placeholder> patterns remain in the text.
 * Excludes common non-placeholder patterns like URLs, HTML tags, etc.
 */
export function countUnfilledPlaceholders(text: string): number {
  // Match patterns like <...> that look like placeholders
  const matches = text.match(/<[^>]{2,}>/g)
  if (!matches) return 0

  // Filter out non-placeholder patterns
  const placeholderMatches = matches.filter((match) => {
    const inner = match.slice(1, -1) // Remove < and >

    // Skip URLs (http://, https://, ftp://, etc.)
    if (/^https?:\/\//i.test(inner) || /^ftp:\/\//i.test(inner)) return false

    // Skip email addresses
    if (/^[^@]+@[^@]+\.[^@]+$/.test(inner)) return false

    // Skip common HTML tags (opening, closing, self-closing)
    if (
      /^\/?\w+(\s+[^>]*)?$/.test(inner) &&
      /^(a|b|i|u|p|br|hr|div|span|img|pre|code|strong|em|ul|ol|li|table|tr|td|th|h[1-6]|script|style|link|meta|head|body|html|input|button|form|label|select|option|textarea|iframe|video|audio|source|canvas|svg|path|circle|rect|line|g|defs|use)/i.test(
        inner.split(/\s/)[0].replace(/^\//, '')
      )
    )
      return false

    // Skip XML-style self-closing patterns
    if (/\/$/.test(inner)) return false

    // Skip patterns that look like code/technical content (contains = or : or .)
    if (/[=:]/.test(inner) && !/^[A-Z][a-z]/.test(inner)) return false

    // This looks like a placeholder (starts with capital letter or is all caps with spaces)
    return true
  })

  return placeholderMatches.length
}
