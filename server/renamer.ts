import fs from 'fs'
import path from 'path'

export interface RenameTarget {
  sourceFilePath: string
  disc: number
  track: number
  title: string
  artist: string
  releaseType?: 'live' | 'album'
  // live
  date: string
  venue: string
  city: string
  state: string
  source: string
  notes: string
  // album
  albumTitle?: string
  year?: string
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

export function buildAlbumName(date: string, venue: string, city: string, state: string): string {
  const parts = [date]
  if (venue) parts.push(venue)
  if (city && state) {
    parts[parts.length - 1] += `, ${city}, ${state}`
  } else if (city) {
    parts[parts.length - 1] += `, ${city}`
  }
  return parts.join(' ')
}

function buildLiveTrackFilename(disc: number, track: number, title: string, ext: string): string {
  const discPart = `d${disc}`
  const trackPart = String(track).padStart(2, '0')
  const cleanTitle = title ? sanitizePathComponent(title.replace(/\.[a-z0-9]{2,5}$/i, '')) : ''
  const titlePart = cleanTitle ? ` ${cleanTitle}` : ''
  return `${discPart}-${trackPart}${titlePart}${ext}`
}

function buildAlbumTrackFilename(track: number, title: string, ext: string): string {
  const trackPart = String(track).padStart(2, '0')
  const cleanTitle = title ? sanitizePathComponent(title.replace(/\.[a-z0-9]{2,5}$/i, '')) : ''
  const titlePart = cleanTitle ? ` ${cleanTitle}` : ''
  return `${trackPart}${titlePart}${ext}`
}

export function buildTargetPath(
  outputDir: string,
  target: RenameTarget
): string {
  const ext = path.extname(target.sourceFilePath).toLowerCase()
  const artist = sanitizePathComponent(target.artist || 'Unknown Artist')

  if (target.releaseType === 'album') {
    const albumName = sanitizePathComponent(
      target.albumTitle ? `${target.albumTitle}${target.year ? ` (${target.year})` : ''}` : 'Unknown Album'
    )
    const trackFilename = buildAlbumTrackFilename(target.track, target.title, ext)
    return path.join(outputDir, artist, albumName, trackFilename)
  }

  const albumName = sanitizePathComponent(
    buildAlbumName(target.date, target.venue, target.city, target.state)
  )
  const trackFilename = buildLiveTrackFilename(target.disc, target.track, target.title, ext)
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
