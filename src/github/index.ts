/**
 * GitHub REST API integration for Lachesis
 *
 * Provides functionality to fetch commit history from GitHub repositories
 * configured in project .ai/config.json files.
 *
 * @example
 * ```typescript
 * import { fetchCommits, getGitLogForProject } from './github'
 *
 * // Fetch commits from a repo URL
 * const result = await fetchCommits('github.com/owner/repo', { perPage: 20 })
 * if (result.success) {
 *   console.log(result.data) // CommitLogEntry[]
 * }
 *
 * // Get formatted git log for a project
 * const log = await getGitLogForProject(project.aiConfig?.github_repo)
 * console.log(log)
 * ```
 */

export {
  parseRepoUrl,
  fetchCommits,
  fetchCommitsForRepo,
  fetchAllCommits,
  formatCommitLog,
  getGitLogForProject,
} from './client'

export type {
  GitHubUser,
  GitHubGitCommit,
  GitHubAccount,
  GitHubCommit,
  RepoInfo,
  CommitLogEntry,
  FetchCommitsOptions,
  GitHubResult,
} from './types'
