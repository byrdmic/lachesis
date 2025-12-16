import { parse as parseYaml } from 'yaml'
import type { Tool } from 'ai'
import {
  EXPECTED_CORE_FILES,
  type ExpectedCoreFile,
  type ProjectSnapshot,
  type SnapshotFileEntry,
  type SnapshotHealth,
  type TemplateStatus,
} from './snapshot.ts'
import { evaluateTemplateStatus } from './template-evaluator.ts'
import { debugLog } from '../../debug/logger.ts'

type ToolMap = Record<string, Tool>

type ListFilesResult =
  | { path: string; name?: string; is_dir?: boolean; size?: number; mtime?: string }[]
  | string[]
  | null
  | undefined

// MCP tool response format from obsidian tools
type MCPToolResponse = {
  content: { type: string; text: string }[]
  isError: boolean
}

/**
 * Convert a full project path to a vault-relative path for MCP tool calls.
 * The vaultPath in config points to where projects are stored (e.g., "G:/My Drive/Nexus/Projects").
 * The MCP tool expects paths relative to the actual Obsidian vault root (parent of vaultPath).
 * Example: "G:\My Drive\Nexus\Projects\Lachesis" with vaultPath "G:\My Drive\Nexus\Projects" -> "./Projects/Lachesis"
 */
function toVaultRelativePath(projectFolder: string, vaultPath: string): string {
  const normalizedProject = projectFolder.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedVault = vaultPath.replace(/\\/g, '/').replace(/\/+$/, '')

  // The actual Obsidian vault root is the parent of the configured vaultPath
  // e.g., if vaultPath is "G:/My Drive/Nexus/Projects", vault root is "G:/My Drive/Nexus"
  const vaultRoot = normalizedVault.split('/').slice(0, -1).join('/')

  // Strip the vault root prefix to get path relative to vault
  if (vaultRoot && normalizedProject.startsWith(vaultRoot + '/')) {
    const relative = normalizedProject.slice(vaultRoot.length + 1)
    return './' + relative
  }

  // Fallback: strip the vaultPath itself and prepend Projects folder name
  if (normalizedProject.startsWith(normalizedVault + '/')) {
    const projectName = normalizedProject.slice(normalizedVault.length + 1)
    const vaultFolderName = normalizedVault.split('/').pop() || 'Projects'
    return './' + vaultFolderName + '/' + projectName
  }

  // Last resort: just use the project folder name with Projects prefix
  const projectName = normalizedProject.split('/').filter(Boolean).pop()
  return projectName ? `./Projects/${projectName}` : normalizedProject
}

/**
 * Parse MCP tool response to extract file list.
 * Handles format: { content: [{ type: "text", text: '["file1.md", "file2.md"]' }], isError: boolean }
 */
function parseMCPFileListResponse(response: unknown): string[] | null {
  if (!response || typeof response !== 'object') return null

  const mcpResponse = response as MCPToolResponse

  // Check for error
  if (mcpResponse.isError) {
    debugLog.warn('MCP tool returned error', { response })
    return null
  }

  // Extract content
  if (!Array.isArray(mcpResponse.content) || mcpResponse.content.length === 0) {
    return null
  }

  const textContent = mcpResponse.content.find(c => c.type === 'text')
  if (!textContent || typeof textContent.text !== 'string') {
    return null
  }

  // Parse the JSON array from the text field
  try {
    const parsed = JSON.parse(textContent.text)
    if (Array.isArray(parsed)) {
      return parsed.filter(item => typeof item === 'string')
    }
  } catch (err) {
    debugLog.warn('Failed to parse MCP file list response', {
      text: textContent.text,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return null
}

function extractFrontmatter(content: string): Record<string, unknown> {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
  const match = content.match(frontmatterRegex)
  if (!match || !match[1]) return {}
  try {
    const parsed = parseYaml(match[1])
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function toProjectRelative(path: string, projectFolder: string): string {
  // Normalize slashes and attempt to strip the project folder prefix in multiple forms
  const normalized = path.replace(/\\/g, '/')
  const projectNorm = projectFolder.replace(/\\/g, '/').replace(/\/+$/, '')
  const projectNormNoLead = projectNorm.replace(/^\/+/, '')

  if (normalized.startsWith(projectNorm + '/')) {
    return normalized.slice(projectNorm.length + 1)
  }
  if (normalized.startsWith(projectNormNoLead + '/')) {
    return normalized.slice(projectNormNoLead.length + 1)
  }

  // Some MCP servers return vault-relative paths like "Projects/<name>/File"
  const projectName = projectNorm.split('/').filter(Boolean).pop()
  if (projectName && normalized.startsWith(projectName + '/')) {
    return normalized.slice(projectName.length + 1)
  }

  return normalized
}

async function callTool(tools: ToolMap, name: string, args: Record<string, unknown>) {
  debugLog.info('callTool', { name, args })
  const tool = tools[name]
  if (!tool || typeof (tool as { execute?: Function }).execute !== 'function') {
    throw new Error(`MCP tool not available: ${name}`)
  }
  return (tool as { execute: Function }).execute(args, {})
}

async function listProjectFiles(
  projectFolder: string,
  vaultPath: string,
  tools: ToolMap,
): Promise<ListFilesResult> {
  const availableTools = Object.keys(tools)
  const hasListDir = typeof tools['obsidian_list_files_in_dir'] !== 'undefined'
  const hasListVault = typeof tools['obsidian_list_files_in_vault'] !== 'undefined'

  // Convert full path to vault-relative path for MCP tool
  const relativePath = toVaultRelativePath(projectFolder, vaultPath)

  debugLog.info('MCP snapshot: tool availability', {
    requestedPath: projectFolder,
    relativePath,
    vaultPath,
    availableTools,
    hasListDir,
    hasListVault,
  })

  // Prefer list_files_in_dir when available
  if (hasListDir) {
    try {
      const result = await callTool(tools, 'obsidian_list_files_in_dir', { dirpath: relativePath })
      debugLog.info('MCP snapshot: obsidian_list_files_in_dir raw result', {
        relativePath,
        resultType: typeof result,
        result,
      })

      // Parse the MCP response format
      const fileList = parseMCPFileListResponse(result)
      if (fileList) {
        debugLog.info('MCP snapshot: obsidian_list_files_in_dir parsed result', {
          relativePath,
          count: fileList.length,
          files: fileList,
        })
        return fileList
      }

      // Fallback: if result is already an array (legacy format), use it directly
      if (Array.isArray(result)) {
        debugLog.info('MCP snapshot: obsidian_list_files_in_dir legacy array result', {
          relativePath,
          count: result.length,
          result: result.slice(0, 5),
        })
        return result as ListFilesResult
      }

      debugLog.warn('MCP snapshot: obsidian_list_files_in_dir unexpected format', {
        relativePath,
        result,
      })
    } catch (err) {
      debugLog.error('MCP snapshot: list_files_in_dir failed', {
        relativePath,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Fallback to list_files_in_vault and filter by prefix
  if (hasListVault) {
    try {
      const vaultResult = await callTool(tools, 'obsidian_list_files_in_vault', {})
      const normalizedPrefix = projectFolder.replace(/\\/g, '/').replace(/\/+$/, '')
      const normalizedPrefixNoLead = normalizedPrefix.replace(/^\/+/, '')
      const projectBase = normalizedPrefix.split('/').filter(Boolean).pop()
      const projectMidPrefix = projectBase ? `Projects/${projectBase}` : null
      const filtered =
        Array.isArray(vaultResult) && vaultResult.length > 0
          ? vaultResult.filter((item) => {
              if (typeof item !== 'string') return false
              const norm = item.replace(/\\/g, '/')
              return (
                norm.startsWith(normalizedPrefix + '/') ||
                norm === normalizedPrefix ||
                norm.startsWith(normalizedPrefixNoLead + '/') ||
                norm === normalizedPrefixNoLead ||
                (projectBase && (norm === projectBase || norm.startsWith(projectBase + '/'))) ||
                (projectMidPrefix &&
                  (norm === projectMidPrefix || norm.startsWith(projectMidPrefix + '/')))
              )
            })
          : []

      debugLog.info('MCP snapshot: list_files_in_vault fallback', {
        projectFolder,
        vaultCount: Array.isArray(vaultResult) ? vaultResult.length : undefined,
        filteredCount: filtered.length,
        sample: filtered.slice(0, 5),
      })
      return filtered as ListFilesResult
    } catch (err) {
      debugLog.error('MCP snapshot: list_files_in_vault failed', {
        projectFolder,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return null
}

/**
 * Parse MCP tool response to extract file content.
 * Handles format: { content: [{ type: "text", text: "file content here" }], isError: boolean }
 */
function parseMCPFileContentResponse(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null

  const mcpResponse = response as MCPToolResponse

  // Check for error
  if (mcpResponse.isError) {
    return null
  }

  // Extract content
  if (!Array.isArray(mcpResponse.content) || mcpResponse.content.length === 0) {
    return null
  }

  const textContent = mcpResponse.content.find(c => c.type === 'text')
  if (!textContent || typeof textContent.text !== 'string') {
    return null
  }

  return textContent.text
}

async function readFileContents(
  projectFolder: string,
  vaultPath: string,
  file: ExpectedCoreFile,
  tools: ToolMap,
): Promise<string | null> {
  // Convert to vault-relative path for MCP tool
  const relativePath = toVaultRelativePath(projectFolder, vaultPath)
  const filePath = `${relativePath}/${file}`

  debugLog.info('readFileContents', { projectFolder, vaultPath, relativePath, file, filePath })

  // Try obsidian_get_file_contents first (common naming)
  const toolName = tools['obsidian_get_file_contents'] ? 'obsidian_get_file_contents' : 'get_file_contents'

  try {
    const result = await callTool(tools, toolName, {
      filepath: filePath,
    })
    debugLog.info('readFileContents result', { filePath, toolName, resultType: typeof result })

    // Try parsing as MCP response format first
    const parsedContent = parseMCPFileContentResponse(result)
    if (parsedContent !== null) {
      return parsedContent
    }

    // Fallback: direct string result
    if (typeof result === 'string') {
      return result
    }

    // Fallback: legacy { content: string } format
    if (result && typeof (result as { content?: unknown }).content === 'string') {
      return (result as { content: string }).content
    }

    debugLog.warn('readFileContents: unexpected result format', { filePath, result })
    return null
  } catch (err) {
    debugLog.warn('readFileContents: failed', {
      filePath,
      toolName,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

function deriveHealth(
  files: Record<ExpectedCoreFile, SnapshotFileEntry>,
): SnapshotHealth {
  const missingFiles: ExpectedCoreFile[] = []
  const thinOrTemplateFiles: SnapshotHealth['thinOrTemplateFiles'] = []

  for (const file of EXPECTED_CORE_FILES) {
    const entry = files[file]
    if (!entry || !entry.exists) {
      missingFiles.push(file)
      continue
    }
    if (entry.templateStatus === 'template_only' || entry.templateStatus === 'thin') {
      thinOrTemplateFiles.push({
        file,
        status: entry.templateStatus,
        reasons: entry.templateFindings,
      })
    }
  }

  return { missingFiles, thinOrTemplateFiles }
}

function parseGithubRepos(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter['github']
  if (raw === undefined || raw === null) return []
  if (typeof raw !== 'string') return []
  const trimmed = raw.trim()
  if (!trimmed || trimmed.toLowerCase() === 'n/a') return []
  return trimmed
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
}

function buildFileEntry(
  projectFolder: string,
  file: ExpectedCoreFile,
  exists: boolean,
  content: string | null,
  sizeBytes?: number,
  modifiedAt?: string,
): SnapshotFileEntry {
  if (!exists || !content) {
    return {
      path: `${projectFolder}/${file}`,
      exists: false,
      sizeBytes,
      modifiedAt,
      frontmatter: {},
      templateStatus: 'missing',
      templateFindings: ['File missing'],
    }
  }

  const frontmatter = extractFrontmatter(content)
  const { status, reasons } = evaluateTemplateStatus(file, content)

  return {
    path: `${projectFolder}/${file}`,
    exists: true,
    sizeBytes,
    modifiedAt,
    frontmatter,
    templateStatus: status,
    templateFindings: reasons,
  }
}

function coerceEntries(
  raw: ListFilesResult,
  projectFolder: string,
): Record<string, { size?: number; mtime?: string }> {
  const entries: Record<string, { size?: number; mtime?: string }> = {}
  if (!raw) return entries

  const addEntry = (rel: string, meta: { size?: number; mtime?: string }) => {
    if (!rel) return
    entries[rel] = meta
    const base = rel.split('/').pop()
    if (base && !entries[base]) {
      entries[base] = meta
    }
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') {
        const rel = toProjectRelative(item, projectFolder)
        addEntry(rel, {})
      } else if (item && typeof item === 'object') {
        const name = (item.name ?? item.path ?? '') as string
        if (!name) continue
        const rel = toProjectRelative(name, projectFolder)
        addEntry(rel, {
          size: typeof item.size === 'number' ? item.size : undefined,
          mtime: typeof item.mtime === 'string' ? item.mtime : undefined,
        })
      }
    }
  }
  return entries
}

function itemMatchesFile(
  item: unknown,
  file: ExpectedCoreFile,
  projectFolder: string,
): boolean {
  const compare = (name: string) => {
    const rel = toProjectRelative(name, projectFolder)
    const base = rel.split('/').pop()
    return rel === file || base === file
  }

  if (typeof item === 'string') {
    return compare(item)
  }

  if (item && typeof item === 'object') {
    const name = (item as { name?: unknown; path?: unknown }).name ?? (item as { path?: unknown }).path
    if (typeof name === 'string') {
      return compare(name)
    }
  }

  return false
}

/**
 * Build a deterministic project snapshot using MCP (Obsidian) tools.
 * Requires MCP connectivity; does not fall back to filesystem scanning.
 */
export async function buildProjectSnapshotViaMCP(
  projectFolder: string,
  vaultPath: string,
  tools: ToolMap,
): Promise<ProjectSnapshot> {
  // Normalize project folder (strip trailing slash)
  const projectFolderNorm = projectFolder.replace(/\\/g, '/').replace(/\/+$/, '')
  const vaultPathNorm = vaultPath.replace(/\\/g, '/').replace(/\/+$/, '')

  const capturedAt = new Date().toISOString()
  const projectName = projectFolderNorm.split('/').pop() || projectFolderNorm

  debugLog.info('MCP snapshot: start', {
    projectFolder,
    projectFolderNorm,
    vaultPath: vaultPathNorm,
    projectName,
  })

  const listResult = await listProjectFiles(projectFolderNorm, vaultPathNorm, tools)
  debugLog.info('MCP snapshot: listResult', { listResult })
  const entryMeta = coerceEntries(listResult, projectFolderNorm)
  debugLog.info('MCP snapshot: coerced entries', {
    keys: Object.keys(entryMeta),
    metaSample: Object.entries(entryMeta)
      .slice(0, 5)
      .map(([k, v]) => ({ k, size: v.size, mtime: v.mtime })),
  })

  const files: Record<ExpectedCoreFile, SnapshotFileEntry> = {} as Record<
    ExpectedCoreFile,
    SnapshotFileEntry
  >

  for (const file of EXPECTED_CORE_FILES) {
    const meta = entryMeta[file]
    const matchedListItem =
      listResult &&
      Array.isArray(listResult) &&
      listResult.find((item) => itemMatchesFile(item, file, projectFolderNorm))
    const exists = Boolean(
      meta ||
        (listResult &&
          Array.isArray(listResult) &&
          matchedListItem),
    )
    const content = exists ? await readFileContents(projectFolderNorm, vaultPathNorm, file, tools) : null
    debugLog.info('MCP snapshot: file check', {
      file,
      exists,
      hasMeta: Boolean(meta),
      metaSize: meta?.size,
      metaMtime: meta?.mtime,
      contentLength: content?.length,
      matchedListItem: matchedListItem ?? null,
      projectFolderNorm,
    })
    files[file] = buildFileEntry(
      projectFolderNorm,
      file,
      exists,
      content,
      meta?.size,
      meta?.mtime,
    )
  }

  const overviewFrontmatter = files['Overview.md']?.frontmatter ?? {}
  const githubRepos = parseGithubRepos(overviewFrontmatter)

  const health = deriveHealth(files)

  debugLog.info('MCP snapshot: health summary', {
    missing: health.missingFiles,
    thinOrTemplate: health.thinOrTemplateFiles,
    githubRepos,
  })

  return {
    projectName,
    projectPath: projectFolder,
    capturedAt,
    expectedFiles: [...EXPECTED_CORE_FILES],
    files,
    githubRepos,
    health,
  }
}

