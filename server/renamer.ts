import fs from 'fs'
import path from 'path'

export interface RenameTarget {
  sourceFilePath: string
  disc: number
  track: number
  title: string
  artist: string
  date: string
  venue: string
  city: string
  state: string
  source: string
  notes: string
}

export interface RenameResult {
  sourceFilePath: string
  targetFilePath: string
  success: boolean
  error?: string
}

function sanitizePathComponent(str: string): string {
  // Remove characters that are invalid in file/folder names on macOS/Windows
  return str
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildAlbumName(date: string, venue: string, city: string, state: string): string {
  const parts = [date]
  if (venue) parts.push(venue)
  if (city && state) {
    parts[parts.length - 1] += `, ${city}, ${state}`
  } else if (city) {
    parts[parts.length - 1] += `, ${city}`
  }
  return parts.join(' ')
}

function buildTrackFilename(disc: number, track: number, title: string, ext: string): string {
  const discPart = `d${disc}`
  const trackPart = String(track).padStart(2, '0')
  const titlePart = title ? ` ${sanitizePathComponent(title)}` : ''
  return `${discPart}-${trackPart}${titlePart}${ext}`
}

export function buildTargetPath(
  outputDir: string,
  target: RenameTarget
): string {
  const ext = path.extname(target.sourceFilePath).toLowerCase()
  const artist = sanitizePathComponent(target.artist || 'Unknown Artist')
  const albumName = sanitizePathComponent(
    buildAlbumName(target.date, target.venue, target.city, target.state)
  )
  const trackFilename = buildTrackFilename(target.disc, target.track, target.title, ext)

  return path.join(outputDir, artist, albumName, trackFilename)
}

export function renameAndMove(targets: RenameTarget[], outputDir: string): RenameResult[] {
  const results: RenameResult[] = []

  for (const target of targets) {
    const targetFilePath = buildTargetPath(outputDir, target)

    try {
      // Create directories
      const targetDir = path.dirname(targetFilePath)
      fs.mkdirSync(targetDir, { recursive: true })

      // Check if source exists
      if (!fs.existsSync(target.sourceFilePath)) {
        results.push({
          sourceFilePath: target.sourceFilePath,
          targetFilePath,
          success: false,
          error: 'Source file not found',
        })
        continue
      }

      // If same path, skip
      if (path.resolve(target.sourceFilePath) === path.resolve(targetFilePath)) {
        results.push({
          sourceFilePath: target.sourceFilePath,
          targetFilePath,
          success: true,
        })
        continue
      }

      // Move file
      fs.renameSync(target.sourceFilePath, targetFilePath)

      results.push({
        sourceFilePath: target.sourceFilePath,
        targetFilePath,
        success: true,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({
        sourceFilePath: target.sourceFilePath,
        targetFilePath,
        success: false,
        error: message,
      })
    }
  }

  return results
}

export function buildPreview(
  targets: RenameTarget[],
  outputDir: string
): Array<{ sourceFilePath: string; targetFilePath: string }> {
  return targets.map(target => ({
    sourceFilePath: target.sourceFilePath,
    targetFilePath: buildTargetPath(outputDir, target),
  }))
}
