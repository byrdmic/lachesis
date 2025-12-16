// Static template file reader
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const TEMPLATE_FILES = {
  overview: 'Overview.md',
  roadmap: 'Roadmap.md',
  tasks: 'Tasks.md',
  log: 'Log.md',
  ideas: 'Ideas.md',
  archive: 'Archive.md',
} as const

export type TemplateName = keyof typeof TEMPLATE_FILES

export function readTemplate(name: TemplateName): string {
  return readFileSync(join(__dirname, TEMPLATE_FILES[name]), 'utf-8')
}
