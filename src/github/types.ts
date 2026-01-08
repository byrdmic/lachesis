/**
 * GitHub REST API types for Lachesis
 */

/** GitHub commit author/committer information */
export type GitHubUser = {
  name: string
  email: string
  date: string
}

/** Git-level commit data */
export type GitHubGitCommit = {
  author: GitHubUser
  committer: GitHubUser
  message: string
  tree: { sha: string; url: string }
  url: string
  comment_count: number
}

/** GitHub user account (may be null for non-GitHub users) */
export type GitHubAccount = {
  login: string
  id: number
  avatar_url: string
  html_url: string
  type: string
} | null

/** A single commit from the GitHub API */
export type GitHubCommit = {
  sha: string
  node_id: string
  commit: GitHubGitCommit
  url: string
  html_url: string
  comments_url: string
  author: GitHubAccount
  committer: GitHubAccount
  parents: Array<{ sha: string; url: string; html_url: string }>
}

/** Parsed repository information */
export type RepoInfo = {
  owner: string
  repo: string
}

/** Simplified commit entry for use in the application */
export type CommitLogEntry = {
  sha: string
  shortSha: string
  message: string
  author: string
  authorEmail: string
  date: Date
  url: string
}

/** Options for fetching commits */
export type FetchCommitsOptions = {
  /** Number of commits to fetch (default: 30, max: 100) */
  perPage?: number
  /** Page number for pagination (default: 1) */
  page?: number
  /** SHA or branch to start listing commits from */
  sha?: string
  /** Only commits after this date (ISO 8601 format) */
  since?: string
  /** Only commits before this date (ISO 8601 format) */
  until?: string
  /** GitHub personal access token (optional, for private repos or higher rate limits) */
  token?: string
}

/** Result of a GitHub API call */
export type GitHubResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; statusCode?: number }
