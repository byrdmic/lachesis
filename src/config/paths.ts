// OS-specific path utilities for Lachesis
import { homedir } from 'os'
import { join } from 'path'

export type Platform = 'windows' | 'macos' | 'linux' | 'unknown'

export function detectPlatform(): Platform {
  const platform = process.platform
  switch (platform) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'macos'
    case 'linux':
      return 'linux'
    default:
      return 'unknown'
  }
}

export function getDefaultVaultPath(): string {
  const home = homedir()
  const platform = detectPlatform()

  switch (platform) {
    case 'windows':
      return join(home, 'Documents', 'Obsidian', 'Projects')
    case 'macos':
      return join(home, 'Documents', 'Obsidian', 'Projects')
    case 'linux':
      return join(home, 'Documents', 'Obsidian', 'Projects')
    default:
      return join(home, 'Obsidian', 'Projects')
  }
}

export function getConfigDir(): string {
  const home = homedir()
  return join(home, '.lachesis')
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}

export function getPlatformDisplayName(): string {
  const platform = detectPlatform()
  switch (platform) {
    case 'windows':
      return 'Windows'
    case 'macos':
      return 'macOS'
    case 'linux':
      return 'Linux'
    default:
      return 'Unknown OS'
  }
}
