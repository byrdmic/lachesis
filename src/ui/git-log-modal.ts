// Git Log Modal - Display recent commits from GitHub

import { App, Modal, Notice } from 'obsidian'
import { fetchCommits, formatCommitLog } from '../github'
import type { CommitLogEntry } from '../github'

export class GitLogModal extends Modal {
  private githubRepo: string
  private githubToken: string
  private commits: CommitLogEntry[] = []
  private isLoading = true
  private error: string | null = null

  constructor(app: App, githubRepo: string, githubToken: string) {
    super(app)
    this.githubRepo = githubRepo
    this.githubToken = githubToken
  }

  async onOpen() {
    const { contentEl } = this
    contentEl.addClass('lachesis-git-log-modal')

    // Show loading state
    this.render()

    // Fetch commits
    const result = await fetchCommits(this.githubRepo, {
      token: this.githubToken || undefined,
      perPage: 30,
    })

    this.isLoading = false

    if (result.success) {
      this.commits = result.data
    } else {
      this.error = result.error
    }

    this.render()
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
  }

  private render() {
    const { contentEl } = this
    contentEl.empty()

    // Header
    const header = contentEl.createDiv({ cls: 'lachesis-git-log-header' })
    header.createEl('h2', { text: 'Recent Commits' })

    // Copy button in header
    if (this.commits.length > 0) {
      const copyBtn = header.createEl('button', {
        text: 'Copy to Clipboard',
        cls: 'mod-cta',
      })
      copyBtn.addEventListener('click', () => this.copyToClipboard())
    }

    // Content area
    const content = contentEl.createDiv({ cls: 'lachesis-git-log-content' })

    if (this.isLoading) {
      content.createEl('p', {
        text: 'Loading commits...',
        cls: 'lachesis-git-log-loading',
      })
      return
    }

    if (this.error) {
      const errorEl = content.createDiv({ cls: 'lachesis-git-log-error' })
      errorEl.createEl('p', { text: this.error })

      if (this.error.includes('404') || this.error.includes('Not Found')) {
        errorEl.createEl('p', {
          text: 'Check that the repository exists and you have access to it.',
          cls: 'lachesis-git-log-hint',
        })
      } else if (this.error.includes('401') || this.error.includes('Bad credentials')) {
        errorEl.createEl('p', {
          text: 'Your GitHub token may be invalid or expired. Check your settings.',
          cls: 'lachesis-git-log-hint',
        })
      }
      return
    }

    if (this.commits.length === 0) {
      content.createEl('p', { text: 'No commits found.' })
      return
    }

    // Commits list
    const listEl = content.createEl('div', { cls: 'lachesis-git-log-list' })

    for (const commit of this.commits) {
      const commitEl = listEl.createDiv({ cls: 'lachesis-git-log-entry' })

      // First line: sha and message
      const mainLine = commitEl.createDiv({ cls: 'lachesis-git-log-main' })
      mainLine.createEl('span', {
        text: commit.shortSha,
        cls: 'lachesis-git-log-sha',
      })

      const firstLine = commit.message.split('\n')[0]
      mainLine.createEl('span', {
        text: firstLine,
        cls: 'lachesis-git-log-message',
      })

      // Second line: author and date
      const metaLine = commitEl.createDiv({ cls: 'lachesis-git-log-meta' })
      const dateStr = commit.date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
      metaLine.setText(`${commit.author} • ${dateStr}`)
    }
  }

  private copyToClipboard() {
    if (this.commits.length === 0) return

    const logText = formatCommitLog(this.commits, { includeDate: true })

    navigator.clipboard.writeText(logText).then(
      () => {
        new Notice('Git log copied to clipboard')
      },
      () => {
        new Notice('Failed to copy to clipboard')
      }
    )
  }
}
