import fs from 'fs'
import path from 'path'
import * as mm from 'music-metadata'

export interface TrackInfo {
  id: string
  filePath: string
  filename: string
  disc: number
  track: number
  title: string
  existingTags: {
    artist?: string
    album?: string
    title?: string
    date?: string
    tracknumber?: string
    discnumber?: string
    comment?: string
  }
  tagStatus: 'full' | 'partial' | 'none'
  subFolder?: string
}

export interface ShowInfo {
  folderPath: string
  artist: string
  date: string
  venue: string
  city: string
  state: string
  source: string
  notes: string
  tracks: TrackInfo[]
}

const AUDIO_EXTENSIONS = ['.flac', '.mp3', '.wav', '.aac', '.ogg', '.m4a', '.ape', '.wv']

function isAudioFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase()
  return AUDIO_EXTENSIONS.includes(ext)
}

// Parse disc number from subfolder name
function parseDiscFromFolder(folderName: string): number | null {
  const lower = folderName.toLowerCase().trim()

  // "Disc 1", "disc1", "DISC 2"
  const discMatch = lower.match(/^disc\s*(\d+)$/)
  if (discMatch) return parseInt(discMatch[1], 10)

  // "d1", "d2"
  const dMatch = lower.match(/^d(\d+)$/)
  if (dMatch) return parseInt(dMatch[1], 10)

  // "Set 1", "set1"
  const setMatch = lower.match(/^set\s*(\d+)$/)
  if (setMatch) return parseInt(setMatch[1], 10)

  // "Set I", "Set II", "Set III"
  const romanMatch = lower.match(/^set\s+(i{1,3}|iv|vi{0,3}|ix)$/)
  if (romanMatch) {
    const roman: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 }
    return roman[romanMatch[1]] || 1
  }

  return null
}

// Parse filename into disc, track, title
function parseFilename(filename: string): { disc: number | null; track: number | null; title: string | null } {
  const base = path.basename(filename, path.extname(filename))

  // db251122d1_01_Crowd  — taper prefix, then dN_TT_Title
  const taperD_T = base.match(/^[a-z]{2,4}\d+d(\d+)[_t](\d+)[_-]?\s*(.*)$/i)
  if (taperD_T) {
    return {
      disc: parseInt(taperD_T[1], 10),
      track: parseInt(taperD_T[2], 10),
      title: taperD_T[3].replace(/[_-]/g, ' ').trim() || null,
    }
  }

  // gd1977-05-08d1t01  — taper prefix with date, dNtTT
  const taperDateDT = base.match(/^[a-z]{2,4}\d{4}-\d{2}-\d{2}d(\d+)t(\d+)[_-]?\s*(.*)$/i)
  if (taperDateDT) {
    return {
      disc: parseInt(taperDateDT[1], 10),
      track: parseInt(taperDateDT[2], 10),
      title: taperDateDT[3].replace(/[_-]/g, ' ').trim() || null,
    }
  }

  // d201 - Banter  — dNTT pattern (disc N, track TT as 2-digit where first digit is disc)
  const dNTT = base.match(/^d(\d)(\d{2})\s*[-_]?\s*(.*)$/i)
  if (dNTT) {
    return {
      disc: parseInt(dNTT[1], 10),
      track: parseInt(dNTT[2], 10),
      title: dNTT[3].replace(/[_-]/g, ' ').trim() || null,
    }
  }

  // d1_01 - Title or d1-01 - Title
  const d_TT = base.match(/^d(\d+)[_-](\d+)\s*[-_]?\s*(.*)$/i)
  if (d_TT) {
    return {
      disc: parseInt(d_TT[1], 10),
      track: parseInt(d_TT[2], 10),
      title: d_TT[3].replace(/[_-]/g, ' ').trim() || null,
    }
  }

  // 01 - Title or 01_Title
  const trackTitle = base.match(/^(\d{1,3})\s*[-_]\s*(.+)$/)
  if (trackTitle) {
    return {
      disc: null,
      track: parseInt(trackTitle[1], 10),
      title: trackTitle[2].replace(/_/g, ' ').trim(),
    }
  }

  // Just a number: 01.flac
  const justNum = base.match(/^(\d{1,3})$/)
  if (justNum) {
    return {
      disc: null,
      track: parseInt(justNum[1], 10),
      title: null,
    }
  }

  // Fallback: use base name as title
  return { disc: null, track: null, title: base.replace(/[_-]/g, ' ').trim() }
}

// Parse folder name into show metadata
export function parseFolderName(folderName: string): Partial<ShowInfo> {
  const result: Partial<ShowInfo> = {}

  // YYYY-MM-DD Venue, City, State
  // YYYY-MM-DD - Venue - City, State
  // YYYY-MM-DD - Venue, City, State
  const dateMatch = folderName.match(/^(\d{4}-\d{2}-\d{2})\s*(?:-\s*)?(.+)$/)
  if (dateMatch) {
    result.date = dateMatch[1]
    const rest = dateMatch[2].trim()

    // Try: Venue - City, State
    const venueCityState1 = rest.match(/^(.+?)\s*-\s*([^,]+),\s*([A-Z]{2})$/)
    if (venueCityState1) {
      result.venue = venueCityState1[1].trim()
      result.city = venueCityState1[2].trim()
      result.state = venueCityState1[3].trim()
      return result
    }

    // Try: Venue, City, State  (last two parts are City, State)
    const parts = rest.split(',').map(p => p.trim())
    if (parts.length >= 3) {
      result.state = parts[parts.length - 1]
      result.city = parts[parts.length - 2]
      result.venue = parts.slice(0, parts.length - 2).join(', ')
      return result
    }

    if (parts.length === 2) {
      // Could be "Venue Name, City ST" or "City, State"
      const cityState = parts[1].match(/^(.+)\s+([A-Z]{2})$/)
      if (cityState) {
        result.venue = parts[0]
        result.city = cityState[1].trim()
        result.state = cityState[2]
      } else {
        result.venue = parts[0]
        result.city = parts[1]
      }
      return result
    }

    // Just a venue
    result.venue = rest
  }

  return result
}

async function readTags(filePath: string): Promise<TrackInfo['existingTags']> {
  try {
    const metadata = await mm.parseFile(filePath, { duration: false })
    const tags = metadata.common
    const result: TrackInfo['existingTags'] = {}

    if (tags.artist) result.artist = tags.artist
    if (tags.album) result.album = tags.album
    if (tags.title) result.title = tags.title
    if (tags.date) result.date = tags.date
    if (tags.track?.no) result.tracknumber = String(tags.track.no)
    if (tags.disk?.no) result.discnumber = String(tags.disk.no)
    if (tags.comment?.length) {
      const c = tags.comment[0]
      result.comment = typeof c === 'string' ? c : (c as { text?: string }).text || String(c)
    }

    return result
  } catch {
    return {}
  }
}

function determineTagStatus(tags: TrackInfo['existingTags']): TrackInfo['tagStatus'] {
  const fields = [tags.artist, tags.album, tags.title, tags.tracknumber]
  const present = fields.filter(Boolean).length
  if (present === 0) return 'none'
  if (present === fields.length) return 'full'
  return 'partial'
}

export async function scanFolder(folderPath: string): Promise<ShowInfo> {
  const resolvedPath = path.resolve(folderPath)

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Folder not found: ${resolvedPath}`)
  }

  const stat = fs.statSync(resolvedPath)
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${resolvedPath}`)
  }

  const folderName = path.basename(resolvedPath)
  const parsedFolder = parseFolderName(folderName)

  const show: ShowInfo = {
    folderPath: resolvedPath,
    artist: parsedFolder.artist || '',
    date: parsedFolder.date || '',
    venue: parsedFolder.venue || '',
    city: parsedFolder.city || '',
    state: parsedFolder.state || '',
    source: '',
    notes: '',
    tracks: [],
  }

  // Collect audio files — top level and one level deep (disc subfolders)
  const audioFiles: Array<{ filePath: string; subFolder: string | null }> = []

  const topEntries = fs.readdirSync(resolvedPath, { withFileTypes: true })
  for (const entry of topEntries) {
    const fullPath = path.join(resolvedPath, entry.name)
    if (entry.isDirectory()) {
      const discNum = parseDiscFromFolder(entry.name)
      const subEntries = fs.readdirSync(fullPath, { withFileTypes: true })
      for (const sub of subEntries) {
        if (sub.isFile() && isAudioFile(sub.name)) {
          audioFiles.push({
            filePath: path.join(fullPath, sub.name),
            subFolder: discNum !== null ? entry.name : entry.name,
          })
        }
      }
    } else if (entry.isFile() && isAudioFile(entry.name)) {
      audioFiles.push({ filePath: fullPath, subFolder: null })
    }
  }

  // Sort by path for consistent ordering
  audioFiles.sort((a, b) => a.filePath.localeCompare(b.filePath))

  // Process each file
  const tracks: TrackInfo[] = []
  let globalTrackCounter = 0

  for (const { filePath, subFolder } of audioFiles) {
    globalTrackCounter++
    const filename = path.basename(filePath)
    const parsed = parseFilename(filename)
    const existingTags = await readTags(filePath)

    // Determine disc number: prefer subfolder disc, then parsed from filename, then 1
    let disc = 1
    if (subFolder) {
      const subDisc = parseDiscFromFolder(subFolder)
      if (subDisc !== null) disc = subDisc
      else if (parsed.disc !== null) disc = parsed.disc
    } else if (parsed.disc !== null) {
      disc = parsed.disc
    }

    // Override disc from existing tags if available and we haven't found one
    if (existingTags.discnumber) {
      const tagDisc = parseInt(existingTags.discnumber, 10)
      if (!isNaN(tagDisc)) disc = tagDisc
    }

    // Track number: prefer parsed, then existing tags, then counter
    let track = parsed.track
    if (track === null && existingTags.tracknumber) {
      track = parseInt(existingTags.tracknumber, 10)
    }
    if (track === null || isNaN(track)) {
      track = globalTrackCounter
    }

    // Title: prefer existing tags, then parsed from filename
    let title = existingTags.title || parsed.title || ''

    // Pull artist/album from tags if show info is missing
    if (!show.artist && existingTags.artist) show.artist = existingTags.artist

    tracks.push({
      id: Buffer.from(filePath).toString('base64'),
      filePath,
      filename,
      disc,
      track,
      title,
      existingTags,
      tagStatus: determineTagStatus(existingTags),
      subFolder: subFolder || undefined,
    })
  }

  show.tracks = tracks
  return show
}
