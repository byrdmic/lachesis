/**
 * Roadmap.md parser for extracting milestone and slice information.
 *
 * Expected format:
 * - Milestones: ### M1 — Title or ### M1 - Title
 * - Status lines: **Status:** active (planned|active|done|blocked|cut)
 * - Slices: #### VS1 — Name or ##### VS1 — Name
 * - Current Focus: ## Current Focus section with **Milestone:** line
 */

import type { MilestoneStatus, ParsedMilestone, ParsedSlice } from '../core/project/status'

// Regex patterns for parsing roadmap structure
// Match milestone headers: ### M1 — Title, ### M1 - Title, ### M1 – Title
const MILESTONE_HEADER_REGEX = /^###\s*(M\d+)\s*[—–-]\s*(.+)$/

// Match status lines: **Status:** active
const STATUS_LINE_REGEX = /^\*\*Status:\*\*\s*(planned|active|done|blocked|cut)/i

// Match slice headers at h4 or h5 level: #### VS1 — Name
const SLICE_HEADER_REGEX = /^#{4,5}\s*(VS\d+)\s*[—–-]\s*(.+)$/

// Match Current Focus section header
const CURRENT_FOCUS_HEADER_REGEX = /^##\s*Current\s*Focus\s*$/i

// Match milestone reference in Current Focus: **Milestone:** M1 — Title
const FOCUS_MILESTONE_REGEX = /^\*\*Milestone:\*\*\s*(M\d+)\s*[—–-]?\s*(.*)$/i

// Valid status values
const VALID_STATUSES: MilestoneStatus[] = ['planned', 'active', 'done', 'blocked', 'cut']

function normalizeStatus(raw: string): MilestoneStatus {
  const lower = raw.toLowerCase().trim()
  if (VALID_STATUSES.includes(lower as MilestoneStatus)) {
    return lower as MilestoneStatus
  }
  return 'planned' // default
}

export type RoadmapParseResult = {
  /** All milestones found */
  milestones: ParsedMilestone[]
  /** All slices found */
  slices: ParsedSlice[]
  /** Milestone ID from Current Focus section (if found) */
  currentFocusMilestoneId: string | null
}

/**
 * Parse Roadmap.md content to extract milestones and slices.
 */
export function parseRoadmap(content: string): RoadmapParseResult {
  const lines = content.split('\n')
  const milestones: ParsedMilestone[] = []
  const slices: ParsedSlice[] = []
  let currentFocusMilestoneId: string | null = null

  let currentMilestoneId: string | null = null
  let inCurrentFocusSection = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Check for Current Focus section header
    if (CURRENT_FOCUS_HEADER_REGEX.test(line)) {
      inCurrentFocusSection = true
      continue
    }

    // If we're in Current Focus section, look for milestone reference
    if (inCurrentFocusSection) {
      // Exit section if we hit another h2 header
      if (/^##\s+/.test(line) && !CURRENT_FOCUS_HEADER_REGEX.test(line)) {
        inCurrentFocusSection = false
      }

      const focusMatch = line.match(FOCUS_MILESTONE_REGEX)
      if (focusMatch) {
        currentFocusMilestoneId = focusMatch[1]
      }
    }

    // Check for milestone header
    const milestoneMatch = line.match(MILESTONE_HEADER_REGEX)
    if (milestoneMatch) {
      const id = milestoneMatch[1]
      const title = milestoneMatch[2].trim()
      currentMilestoneId = id

      // Look ahead for status line (within next 5 lines)
      let status: MilestoneStatus = 'planned'
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const lookAheadLine = lines[j].trim()
        // Stop if we hit another header
        if (/^#{1,5}\s/.test(lookAheadLine)) break

        const statusMatch = lookAheadLine.match(STATUS_LINE_REGEX)
        if (statusMatch) {
          status = normalizeStatus(statusMatch[1])
          break
        }
      }

      milestones.push({ id, title, status })
      continue
    }

    // Check for slice header
    const sliceMatch = line.match(SLICE_HEADER_REGEX)
    if (sliceMatch && currentMilestoneId) {
      const id = sliceMatch[1]
      const name = sliceMatch[2].trim()
      slices.push({
        id,
        name,
        milestoneId: currentMilestoneId,
      })
    }
  }

  return {
    milestones,
    slices,
    currentFocusMilestoneId,
  }
}

/**
 * Find the current active milestone.
 * Priority:
 * 1. Milestone referenced in Current Focus section
 * 2. First milestone with status 'active'
 * 3. null if no active milestone found
 */
export function findCurrentMilestone(
  milestones: ParsedMilestone[],
  currentFocusMilestoneId: string | null,
): ParsedMilestone | null {
  // First check Current Focus reference
  if (currentFocusMilestoneId) {
    const focused = milestones.find((m) => m.id === currentFocusMilestoneId)
    if (focused) return focused
  }

  // Fallback to first active milestone
  return milestones.find((m) => m.status === 'active') || null
}

/**
 * Find the active slice.
 * Returns the first slice belonging to the current milestone.
 */
export function findActiveSlice(
  slices: ParsedSlice[],
  currentMilestone: ParsedMilestone | null,
): ParsedSlice | null {
  if (!currentMilestone) return null
  return slices.find((s) => s.milestoneId === currentMilestone.id) || null
}
