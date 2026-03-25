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

export type ReleaseType = 'live' | 'album'

export interface ShowInfo {
  folderPath: string
  releaseType: ReleaseType
  artist: string
  // Live show fields
  date: string
  venue: string
  city: string
  state: string
  source: string
  notes: string
  // Official album fields
  albumTitle: string
  year: string
  tracks: TrackInfo[]
}

const AUDIO_EXTENSIONS = ['.flac', '.mp3', '.wav', '.aac', '.ogg', '.m4a', '.ape', '.wv']

function isAudioFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase()
  return AUDIO_EXTENSIONS.includes(ext)
}

// Parse disc number from subfolder name
export function parseDiscFromFolder(folderName: string): number | null {
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

  // d1_t01_Title or d1_t01 Title  (disc_trackWithT_Title)
  const d_tTT = base.match(/^d(\d+)[_-]t(\d+)[_\s-]?\s*(.*)$/i)
  if (d_tTT) {
    return {
      disc: parseInt(d_tTT[1], 10),
      track: parseInt(d_tTT[2], 10),
      title: d_tTT[3].replace(/[_]/g, ' ').trim() || null,
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
    // Strip nugs-style t0N_ infix: "01 - t01_Intro" → title "Intro"
    const rawTitle = trackTitle[2].replace(/_/g, ' ').trim()
    const strippedTitle = rawTitle.replace(/^t\d+\s*/i, '').trim()
    return {
      disc: null,
      track: parseInt(trackTitle[1], 10),
      title: strippedTitle || rawTitle,
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

  // Strip trailing quality/format junk: [16-48], [FLAC], (V0), - FLAC16, powered by nugs.net, etc.
  let cleanName = folderName
    .replace(/\s*\[[^\]]*\]/g, '')           // [anything]
    .replace(/\s*\([^)]*\)/g, '')            // (anything)
    .replace(/\s*-?\s*FLAC\d*$/i, '')        // trailing -FLAC16
    .replace(/\s*-?\s*WEB\s*V\d.*$/i, '')    // trailing -WEB V0...
    .replace(/\s*powered by.*$/i, '')         // powered by nugs.net
    .trim()

  // Strip leading taper prefixes before the date: "db", "tdb", "gd", "wsp", "phish", etc.
  // Pattern: optional 2-5 letter taper code immediately followed by YYYY-MM-DD or YYYYMMDD
  cleanName = cleanName.replace(/^[a-z]{1,5}(?=\d{4}[-\/]?\d{2}[-\/]?\d{2})/i, '').trim()
  // Also strip leading taper code separated by space: "tdb 2008-04-18..."
  cleanName = cleanName.replace(/^[a-z]{1,5}\s+(?=\d{4}[-\/]?\d{2}[-\/]?\d{2})/i, '').trim()
  // Also strip taper code separated by dash: "tDB - 2009-04-25 ..."
  cleanName = cleanName.replace(/^[a-z]{1,5}\s*-\s*(?=\d{4}[-\/]?\d{2}[-\/]?\d{2})/i, '').trim()

  // Helper: parse venue/city/state from a string
  function parseVenueStr(str: string): void {
    // Strip any remaining junk in parens/brackets
    str = str.replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '').trim()
    if (!str) return

    // "Venue - City, ST"
    const m1 = str.match(/^(.+?)\s*-\s*([^,\-]+),\s*([A-Z]{2,3}(?:\s*\(.*\))?)$/)
    if (m1) { result.venue = m1[1].trim(); result.city = m1[2].trim(); result.state = m1[3].trim(); return }

    // "Venue, City, ST" — last part is state (2 letters), second-last is city
    const parts = str.split(',').map(p => p.trim()).filter(Boolean)
    if (parts.length >= 3) {
      const lastPart = parts[parts.length - 1]
      if (/^[A-Z]{2,3}$/.test(lastPart) || /^[A-Z]{2,3}\s/.test(lastPart)) {
        result.state = lastPart
        result.city = parts[parts.length - 2]
        result.venue = parts.slice(0, parts.length - 2).join(', ')
        return
      }
    }

    if (parts.length === 2) {
      // "Venue, City ST" or "Venue, City"
      const cityState = parts[1].match(/^(.+?)\s+([A-Z]{2,3})$/)
      if (cityState) { result.venue = parts[0]; result.city = cityState[1].trim(); result.state = cityState[2]; return }
      result.venue = parts[0]; result.city = parts[1]; return
    }

    if (parts.length === 1) {
      result.venue = parts[0]
    }
  }

  // Normalise underscore dates: 1999_09_24 → 1999-09-24
  cleanName = cleanName.replace(/^(\d{4})_(\d{2})_(\d{2})/, '$1-$2-$3')

  // Pattern 1: YYYY-MM-DD [- ] rest
  const p1 = cleanName.match(/^(\d{4}-\d{2}-\d{2})\s*(?:-\s*)?(.+)$/)
  if (p1) {
    result.date = p1[1]
    parseVenueStr(p1[2])
    return result
  }

  // Pattern 2: YYYYMMDD rest (no dashes in date)
  const p2 = cleanName.match(/^(\d{4})(\d{2})(\d{2})[_\s-](.+)$/)
  if (p2) {
    result.date = `${p2[1]}-${p2[2]}-${p2[3]}`
    parseVenueStr(p2[4])
    return result
  }

  // Pattern 3: Artist - YYYY-MM-DD - rest
  const p3 = cleanName.match(/^(.+?)\s*-\s*(\d{4}-\d{2}-\d{2})\s*-\s*(.*)$/)
  if (p3) {
    result.artist = p3[1].trim().replace(/[-–—\s]+$/, '').trim()
    result.date = p3[2]
    if (p3[3]) parseVenueStr(p3[3])
    return result
  }

  // Pattern 4: Artist YYYY-MM-DD [- ] rest  (no dash between artist and date)
  const p4 = cleanName.match(/^(.+?)\s+(\d{4}-\d{2}-\d{2})\s*(?:-\s*)?(.*)$/)
  if (p4) {
    result.artist = p4[1].trim().replace(/[-–—\s]+$/, '').trim()
    result.date = p4[2]
    if (p4[3]) parseVenueStr(p4[3])
    return result
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

  // Detect release type: if no date parsed and folder looks like "Album Title (Year)" → album
  const hasDate = !!parsedFolder.date
  const albumYearMatch = folderName.match(/\((\d{4})\)/) || folderName.match(/\[(\d{4})\]/)
  const looksLikeAlbum = !hasDate && !!albumYearMatch
  const releaseType: ReleaseType = looksLikeAlbum ? 'album' : 'live'
  const albumYear = albumYearMatch ? albumYearMatch[1] : ''
  // Strip year and quality junk for album title
  const albumTitle = looksLikeAlbum
    ? folderName.replace(/\s*\(.*?\)/g, '').replace(/\s*\[.*?\]/g, '').trim()
    : ''

  const show: ShowInfo = {
    folderPath: resolvedPath,
    releaseType,
    artist: parsedFolder.artist || '',
    date: parsedFolder.date || '',
    venue: parsedFolder.venue || '',
    city: parsedFolder.city || '',
    state: parsedFolder.state || '',
    source: '',
    notes: '',
    albumTitle,
    year: albumYear,
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
    // Strip common taper cruft from tag titles
    const rawTagTitle = existingTags.title
      ? existingTags.title
          .replace(/^[-\s]+/, '')                              // leading dash/space: "- 10-05d1t01 Title"
          .replace(/^\d{2}-\d{2}d\d+t\d+\s*/i, '')           // MM-DDdNtNN prefix
          .replace(/^t\d+[-_\s]*/i, '')                       // t01_ prefix
          .trim()
      : ''
    let title = rawTagTitle || parsed.title || ''

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
