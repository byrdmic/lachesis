/**
 * GitHub REST API client for Lachesis
 *
 * Provides functionality to fetch commit history from GitHub repositories.
 */

import type {
  CommitLogEntry,
  FetchCommitsOptions,
  GitHubCommit,
  GitHubResult,
  RepoInfo,
} from './types'

const GITHUB_API_BASE = 'https://api.github.com'

/**
 * Parse a GitHub repository URL into owner and repo components.
 *
 * Supports formats:
 * - https://github.com/owner/repo
 * - http://github.com/owner/repo
 * - github.com/owner/repo
 * - owner/repo
 * - https://github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 *
 * @param repoUrl - The repository URL or shorthand
 * @returns Parsed repo info or null if invalid
 */
export function parseRepoUrl(repoUrl: string): RepoInfo | null {
  if (!repoUrl || typeof repoUrl !== 'string') {
    return null
  }

  const trimmed = repoUrl.trim()

  // Handle SSH format: git@github.com:owner/repo.git
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] }
  }

  // Handle HTTPS/HTTP format: https://github.com/owner/repo
  const httpsMatch = trimmed.match(
    /^(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/
  )
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] }
  }

  // Handle shorthand: owner/repo
  const shortMatch = trimmed.match(/^([^/]+)\/([^/]+)$/)
  if (shortMatch && !trimmed.includes('.') && !trimmed.includes(':')) {
    return { owner: shortMatch[1], repo: shortMatch[2] }
  }

  return null
}

/**
 * Convert a GitHub API commit to a simplified log entry.
 */
function toCommitLogEntry(commit: GitHubCommit): CommitLogEntry {
  return {
    sha: commit.sha,
    shortSha: commit.sha.substring(0, 7),
    message: commit.commit.message,
    author: commit.commit.author.name,
    authorEmail: commit.commit.author.email,
    date: new Date(commit.commit.author.date),
    url: commit.html_url,
  }
}

/**
 * Fetch commits from a GitHub repository.
 *
 * @param repoUrl - The repository URL (any supported format)
 * @param options - Fetch options (pagination, date filters, token)
 * @returns Result with commit log entries or error
 */
export async function fetchCommits(
  repoUrl: string,
  options: FetchCommitsOptions = {}
): Promise<GitHubResult<CommitLogEntry[]>> {
  const repoInfo = parseRepoUrl(repoUrl)
  if (!repoInfo) {
    return {
      success: false,
      error: `Invalid GitHub repository URL: ${repoUrl}`,
    }
  }

  return fetchCommitsForRepo(repoInfo, options)
}

/**
 * Fetch commits using parsed repo info.
 *
 * @param repoInfo - Parsed owner and repo
 * @param options - Fetch options
 * @returns Result with commit log entries or error
 */
export async function fetchCommitsForRepo(
  repoInfo: RepoInfo,
  options: FetchCommitsOptions = {}
): Promise<GitHubResult<CommitLogEntry[]>> {
  const { owner, repo } = repoInfo
  const { perPage = 30, page = 1, sha, since, until, token } = options

  // Build URL with query parameters
  const url = new URL(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits`)
  url.searchParams.set('per_page', String(Math.min(perPage, 100)))
  url.searchParams.set('page', String(page))

  if (sha) url.searchParams.set('sha', sha)
  if (since) url.searchParams.set('since', since)
  if (until) url.searchParams.set('until', until)

  // Build headers
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Lachesis-Obsidian-Plugin',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const response = await fetch(url.toString(), { headers })

    if (!response.ok) {
      const errorBody = await response.text()
      let errorMessage = `GitHub API error: ${response.status} ${response.statusText}`

      // Parse GitHub error message if available
      try {
        const errorJson = JSON.parse(errorBody)
        if (errorJson.message) {
          errorMessage = `GitHub API: ${errorJson.message}`
        }
      } catch {
        // Use default error message
      }

      return {
        success: false,
        error: errorMessage,
        statusCode: response.status,
      }
    }

    const commits = (await response.json()) as GitHubCommit[]
    const logEntries = commits.map(toCommitLogEntry)

    return { success: true, data: logEntries }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      error: `Failed to fetch commits: ${message}`,
    }
  }
}

/**
 * Fetch all commits from a repository (handles pagination automatically).
 *
 * Warning: This can make many API requests for repos with long histories.
 * Consider using date filters (since/until) to limit results.
 *
 * @param repoUrl - The repository URL
 * @param options - Fetch options (token, date filters)
 * @param maxPages - Maximum number of pages to fetch (default: 10)
 * @returns Result with all commit log entries or error
 */
export async function fetchAllCommits(
  repoUrl: string,
  options: Omit<FetchCommitsOptions, 'page' | 'perPage'> = {},
  maxPages = 10
): Promise<GitHubResult<CommitLogEntry[]>> {
  const repoInfo = parseRepoUrl(repoUrl)
  if (!repoInfo) {
    return {
      success: false,
      error: `Invalid GitHub repository URL: ${repoUrl}`,
    }
  }

  const allCommits: CommitLogEntry[] = []
  let page = 1

  while (page <= maxPages) {
    const result = await fetchCommitsForRepo(repoInfo, {
      ...options,
      page,
      perPage: 100,
    })

    if (!result.success) {
      // If we have some commits and hit an error, return what we have
      if (allCommits.length > 0) {
        return { success: true, data: allCommits }
      }
      return result
    }

    allCommits.push(...result.data)

    // If we got fewer than 100 commits, we've reached the end
    if (result.data.length < 100) {
      break
    }

    page++
  }

  return { success: true, data: allCommits }
}

/**
 * Format commit log entries as a readable string (similar to git log --oneline).
 *
 * @param commits - Array of commit log entries
 * @param options - Formatting options
 * @returns Formatted string
 */
export function formatCommitLog(
  commits: CommitLogEntry[],
  options: { includeDate?: boolean; includeFull?: boolean } = {}
): string {
  const { includeDate = false, includeFull = false } = options

  return commits
    .map((commit) => {
      const firstLine = commit.message.split('\n')[0]

      if (includeFull) {
        const dateStr = commit.date.toISOString().split('T')[0]
        return `commit ${commit.sha}\nAuthor: ${commit.author} <${commit.authorEmail}>\nDate:   ${dateStr}\n\n    ${commit.message.split('\n').join('\n    ')}\n`
      }

      if (includeDate) {
        const dateStr = commit.date.toISOString().split('T')[0]
        return `${commit.shortSha} ${dateStr} ${firstLine}`
      }

      return `${commit.shortSha} ${firstLine}`
    })
    .join(includeFull ? '\n' : '\n')
}

/**
 * Get the git log for a project's configured GitHub repository.
 *
 * @param githubRepo - The github_repo value from .ai/config.json
 * @param options - Fetch options
 * @returns Formatted git log string or error message
 */
export async function getGitLogForProject(
  githubRepo: string | undefined,
  options: FetchCommitsOptions & { format?: 'oneline' | 'short' | 'full' } = {}
): Promise<string> {
  if (!githubRepo) {
    return 'No GitHub repository configured for this project.'
  }

  const { format = 'oneline', ...fetchOptions } = options
  const result = await fetchCommits(githubRepo, fetchOptions)

  if (!result.success) {
    return `Error fetching git log: ${result.error}`
  }

  if (result.data.length === 0) {
    return 'No commits found.'
  }

  return formatCommitLog(result.data, {
    includeDate: format === 'short',
    includeFull: format === 'full',
  })
}
