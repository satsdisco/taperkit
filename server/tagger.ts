import { execSync } from 'child_process'
import path from 'path'

export interface TagData {
  artist: string
  album: string
  title: string
  tracknumber: string
  discnumber: string
  date: string
  comment: string
}

function checkToolAvailable(tool: string): boolean {
  try {
    execSync(`which ${tool}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function checkToolsAvailable(): { metaflac: boolean; id3v2: boolean } {
  return {
    metaflac: checkToolAvailable('metaflac'),
    id3v2: checkToolAvailable('id3v2'),
  }
}

function escapeShellArg(value: string): string {
  // Escape single quotes for shell
  return value.replace(/'/g, "'\\''")
}

export function writeFLACTags(filePath: string, tags: TagData): void {
  const args: string[] = ['--remove-all-tags']

  const tagMap: Record<string, string> = {
    ARTIST: tags.artist,
    ALBUM: tags.album,
    TITLE: tags.title,
    TRACKNUMBER: tags.tracknumber,
    DISCNUMBER: tags.discnumber,
    DATE: tags.date,
    COMMENT: tags.comment,
  }

  for (const [key, value] of Object.entries(tagMap)) {
    if (value) {
      args.push(`--set-tag=${key}=${escapeShellArg(value)}`)
    }
  }

  args.push(`'${escapeShellArg(filePath)}'`)

  const cmd = `metaflac ${args.join(' ')}`
  execSync(cmd, { stdio: 'pipe' })
}

export function writeMP3Tags(filePath: string, tags: TagData): void {
  const args: string[] = []

  if (tags.artist) args.push(`-a '${escapeShellArg(tags.artist)}'`)
  if (tags.album) args.push(`-A '${escapeShellArg(tags.album)}'`)
  if (tags.title) args.push(`-t '${escapeShellArg(tags.title)}'`)
  if (tags.tracknumber) args.push(`-T '${escapeShellArg(tags.tracknumber)}'`)
  if (tags.date) args.push(`-y '${escapeShellArg(tags.date)}'`)
  if (tags.comment) args.push(`-c '${escapeShellArg(tags.comment)}'`)

  args.push(`'${escapeShellArg(filePath)}'`)

  const cmd = `id3v2 ${args.join(' ')}`
  execSync(cmd, { stdio: 'pipe' })
}

export function writeTags(filePath: string, tags: TagData): { success: boolean; error?: string } {
  const ext = path.extname(filePath).toLowerCase()

  try {
    if (ext === '.flac') {
      if (!checkToolAvailable('metaflac')) {
        return { success: false, error: 'metaflac not found. Install with: brew install flac' }
      }
      writeFLACTags(filePath, tags)
    } else if (ext === '.mp3') {
      if (!checkToolAvailable('id3v2')) {
        return { success: false, error: 'id3v2 not found. Install with: brew install id3v2' }
      }
      writeMP3Tags(filePath, tags)
    } else {
      return { success: false, error: `Unsupported format for tag writing: ${ext}` }
    }
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
