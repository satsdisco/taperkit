import { execSync, execFileSync } from 'child_process'
import path from 'path'

export interface TagData {
  artist: string
  albumartist?: string
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
  // Use execFileSync with array args — no shell interpretation, no quoting issues
  const tagMap: Record<string, string> = {
    ARTIST: tags.artist,
    ALBUMARTIST: tags.albumartist ?? tags.artist,
    ALBUM: tags.album,
    TITLE: tags.title,
    TRACKNUMBER: tags.tracknumber,
    DISCNUMBER: tags.discnumber,
    DATE: tags.date,
    COMMENT: tags.comment,
  }

  const args: string[] = ['--remove-all-tags']
  for (const [key, value] of Object.entries(tagMap)) {
    if (value) args.push(`--set-tag=${key}=${value}`)
  }
  args.push(filePath)

  execFileSync('metaflac', args, { stdio: 'pipe' })
}

export function writeMP3Tags(filePath: string, tags: TagData): void {
  // Use execFileSync with array args
  const args: string[] = []
  if (tags.artist) args.push('-a', tags.artist)
  if (tags.albumartist ?? tags.artist) args.push('--TPE2', tags.albumartist ?? tags.artist)
  if (tags.album) args.push('-A', tags.album)
  if (tags.title) args.push('-t', tags.title)
  if (tags.tracknumber) {
    const trackNum = tags.discnumber ? `${tags.tracknumber}` : tags.tracknumber
    args.push('-T', trackNum)
  }
  if (tags.date) args.push('-y', tags.date)
  if (tags.comment) args.push('-c', tags.comment)
  // id3v2 doesn't have a --disc flag; write TPOS frame directly
  if (tags.discnumber) args.push('--TPOS', tags.discnumber)
  args.push(filePath)

  execFileSync('id3v2', args, { stdio: 'pipe' })
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
