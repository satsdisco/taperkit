import fs from 'fs'
import path from 'path'
import * as mm from 'music-metadata'
import { parseFolderName, parseDiscFromFolder } from './scanner.js'
import { writeTags, checkToolsAvailable } from './tagger.js'
import { normalizeUnicode } from './normalizeText.js'

const AUDIO_EXTENSIONS = ['.flac', '.mp3', '.wav', '.aac', '.ogg', '.m4a', '.ape', '.wv']

function isAudioFile(filename: string): boolean {
  return AUDIO_EXTENSIONS.includes(path.extname(filename).toLowerCase())
}

// Artist normalization lookup
const ARTIST_NORM: Record<string, string> = {
  'disco biscuits': 'The Disco Biscuits',
  'the disco biscuits': 'The Disco Biscuits',
  'db': 'The Disco Biscuits',
  'tdb': 'The Disco Biscuits',
  'wsp': 'Widespread Panic',
  'widespread panic': 'Widespread Panic',
  'gd': 'Grateful Dead',
  'grateful dead': 'Grateful Dead',
  'phish': 'Phish',
  'phsh': 'Phish',
  'ph': 'Phish',
  'live phish': 'Phish',
  'livephish': 'Phish',
  'allman brothers band': 'The Allman Brothers Band',
  'the allman brothers band': 'The Allman Brothers Band',
  'allman brothers': 'The Allman Brothers Band',
  'the allman brothers': 'The Allman Brothers Band',
  // moe. — canonical name includes the period
  'moe': 'moe.',
  'moe.': 'moe.',
}

export function normalizeArtist(raw: string): string {
  if (!raw) return raw
  // Normalize ALL Unicode lookalikes (hyphens, quotes, spaces, etc.)
  const normalized = normalizeUnicode(raw)
  // Strip trailing dash/punctuation that creeps in from folder names
  const cleaned = normalized.trim().replace(/[-–—\s]+$/, '').trim()
  const key = cleaned.toLowerCase()
  return ARTIST_NORM[key] ?? cleaned
}

/** Normalize a song title: Unicode cleanup, then trim */
export function normalizeTitle(raw: string): string {
  if (!raw) return raw
  return normalizeUnicode(raw)
}

export interface LibraryFile {
  filePath: string
  filename: string
  ext: string
  existingTags: {
    artist?: string
    album?: string
    title?: string
    date?: string
    tracknumber?: string
    discnumber?: string
    comment?: string
  }
}

export interface LibraryShow {
  id: string
  folderPath: string
  sourcePath: string
  releaseType: 'live' | 'album'
  artist: string
  date: string
  venue: string
  city: string
  state: string
  albumTitle: string
  year: string
  healthScore: number
  healthIssues: string[]
  fileCount: number
  hasFlac: boolean
  hasMp3: boolean
  tagStatus: 'full' | 'partial' | 'none'
  alreadyDone: boolean
  destinationPath?: string
  files: LibraryFile[]
}

export interface DuplicateShow extends LibraryShow {
  isWinner: boolean
  winnerReason: string
}

export interface DuplicateGroup {
  key: string
  shows: DuplicateShow[]
}

export interface LibraryShowSuggestion {
  showId: string
  originalShow: LibraryShow
  releaseType: 'live' | 'album'
  artist: string
  date: string
  venue: string
  city: string
  state: string
  source: string
  albumTitle: string
  year: string
  proposedFolderName: string
  proposedFiles: Array<{ originalFilename: string; proposedFilename: string }>
}

export interface BatchApplyResult {
  showId: string
  success: boolean
  destinationPath?: string
  error?: string
  filesProcessed: number
}

export type ScanEvent =
  | { type: 'progress'; msg: string; current: number }
  | { type: 'done'; shows: LibraryShow[] }

async function readFirstFileTags(filePath: string): Promise<LibraryFile['existingTags']> {
  try {
    const metadata = await mm.parseFile(filePath, { duration: false })
    const t = metadata.common
    const result: LibraryFile['existingTags'] = {}
    if (t.artist) result.artist = t.artist
    if (t.album) result.album = t.album
    if (t.title) result.title = t.title
    if (t.date) result.date = t.date
    if (t.track?.no) result.tracknumber = String(t.track.no)
    if (t.disk?.no) result.discnumber = String(t.disk.no)
    if (t.comment?.length) {
      const c = t.comment[0]
      result.comment = typeof c === 'string' ? c : (c as { text?: string }).text ?? String(c)
    }
    return result
  } catch {
    return {}
  }
}

function collectAudioFiles(folderPath: string): string[] {
  const files: string[] = []
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true })
    for (const e of entries) {
      if (e.isFile() && isAudioFile(e.name)) {
        files.push(path.join(folderPath, e.name))
      } else if (e.isDirectory()) {
        try {
          const sub = fs.readdirSync(path.join(folderPath, e.name), { withFileTypes: true })
          for (const s of sub) {
            if (s.isFile() && isAudioFile(s.name)) {
              files.push(path.join(folderPath, e.name, s.name))
            }
          }
        } catch { /* skip inaccessible subfolders */ }
      }
    }
  } catch { /* skip inaccessible folders */ }
  files.sort()
  return files
}

function scoreHealth(
  artist: string,
  date: string,
  venue: string,
  files: string[],
  tagStatus: 'full' | 'partial' | 'none'
): { score: number; issues: string[] } {
  let score = 100
  const issues: string[] = []

  // Accept YYYY-MM-DD including day 00 (some shows only have month known)
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    score -= 30
    issues.push('Missing or invalid date')
  }
  if (!artist) {
    score -= 20
    issues.push('Missing artist')
  }
  if (!venue) {
    score -= 15
    issues.push('Missing venue')
  }
  const messyCount = files.filter(f => /^[a-z]{2,4}\d+/i.test(path.basename(f))).length
  if (files.length > 0 && messyCount > files.length / 2) {
    score -= 10
    issues.push('Files have taper-style naming')
  }
  if (tagStatus === 'none') {
    score -= 10
    issues.push('No tags written')
  } else if (tagStatus === 'partial') {
    score -= 5
    issues.push('Tags incomplete')
  }

  return { score: Math.max(0, score), issues }
}

// For flat structure: try to extract artist name from venue string like "Artist - Venue"
function splitArtistFromVenue(venue: string): { artist: string | null; venue: string } {
  const dashIdx = venue.indexOf(' - ')
  if (dashIdx === -1) return { artist: null, venue }
  const potentialArtist = venue.slice(0, dashIdx).trim()
  const potentialVenue = venue.slice(dashIdx + 3).trim()
  // Accept if it looks like an artist name (few words, in normalization map, or short)
  const normalized = ARTIST_NORM[potentialArtist.toLowerCase()]
  if (normalized || potentialArtist.split(' ').length <= 5) {
    return { artist: normalized ?? potentialArtist, venue: potentialVenue }
  }
  return { artist: null, venue }
}

async function buildShow(
  folderPath: string,
  sourcePath: string,
  artistHint: string | null
): Promise<LibraryShow | null> {
  const files = collectAudioFiles(folderPath)
  if (files.length === 0) return null

  const folderName = path.basename(folderPath)
  const parsed = parseFolderName(folderName)

  let tagsFromFile: LibraryFile['existingTags'] = {}
  try {
    tagsFromFile = await readFirstFileTags(files[0])
  } catch { /* skip */ }

  let parsedVenue = parsed.venue || ''
  let parsedArtist = parsed.artist || ''

  // For flat structure (no artistHint), try to extract artist from venue string
  if (!artistHint && parsedVenue && !parsedArtist) {
    const split = splitArtistFromVenue(parsedVenue)
    if (split.artist) {
      parsedArtist = split.artist
      parsedVenue = split.venue
    }
  }

  // Prefer tag artist over folder-parsed artist when the folder artist looks like
  // it contains extra series/subtitle info (e.g. "Widespread Panic - Porch Songs #07")
  let folderArtist = parsedArtist || parsed.artist || ''
  const tagArtist = tagsFromFile.artist || ''
  // If tag artist is a clean prefix of the folder artist, the folder has extra junk — use tag
  const folderArtistLower = folderArtist.toLowerCase()
  const tagArtistLower = tagArtist.toLowerCase()
  if (tagArtist && folderArtist && folderArtistLower !== tagArtistLower) {
    if (folderArtistLower.startsWith(tagArtistLower)) {
      folderArtist = tagArtist // tag is cleaner
    }
  }
  const artist = normalizeArtist(folderArtist || tagArtist || artistHint || '')

  // Detect release type — trust parseFolderName first, then fall back to heuristics
  const folderNameClean = path.basename(folderPath)
  const albumYearMatch = folderNameClean.match(/\((\d{4})\)/) || folderNameClean.match(/\[(\d{4})\]/)
  const hasDate = !!parsed.date
  const looksLikeAlbum = parsed.releaseType === 'album' || (!hasDate && !!albumYearMatch)
  const releaseType: 'live' | 'album' = looksLikeAlbum ? 'album' : 'live'
  const albumYear = parsed.year || (albumYearMatch ? albumYearMatch[1] : (parsed.date ? parsed.date.slice(0, 4) : ''))
  const albumTitleParsed = parsed.albumTitle
    || (looksLikeAlbum
      ? folderNameClean.replace(/\s*\{[^}]*\}/g, '').replace(/\s*\(.*?\)/g, '').replace(/\s*\[.*?\]/g, '').replace(new RegExp(`^${artist}\\s*-?\\s*`, 'i'), '').trim()
      : '')

  // Normalise date: accept YYYY-MM-DD, YYYY/MM/DD, YYYYMMDD, MM-DD-YYYY, MM/DD/YYYY
  function normalizeDate(raw: string): string {
    if (!raw) return ''
    // YYYY-MM-DD or YYYY/MM/DD
    const m1 = raw.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/)
    if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`
    // YYYYMMDD
    const m2 = raw.match(/^(\d{4})(\d{2})(\d{2})$/)
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`
    // MM-DD-YYYY or MM/DD/YYYY (LivePhish folder naming)
    const m3 = raw.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
    if (m3) return `${m3[3]}-${m3[1]}-${m3[2]}`
    return raw
  }

  // Extract date + venue/city from album tag like "2008/04/18 The Georgia Theatre, Athens, GA"
  // or LivePhish format: "LivePhish: 1998/04/03 - Nassau Coliseum - Uniondale, NY"
  let tagDate = tagsFromFile.date || ''
  let tagVenue = ''
  let tagCity = ''
  let tagState = ''
  if (tagsFromFile.album) {
    // Strip "LivePhish: " or similar prefixes before parsing
    const albumStr = tagsFromFile.album.replace(/^live\s*phish\s*:\s*/i, '').trim()
    const albumDateMatch = albumStr.match(/^(\d{4}[\/\-]\d{2}[\/\-]\d{2})\s*[-–]?\s*(.*)$/)
    if (albumDateMatch) {
      if (!tagDate) tagDate = albumDateMatch[1]
      const rest = albumDateMatch[2].trim()
      if (rest) {
        // Parse "Venue - City, ST" or "Venue, City, ST" or "Venue, City" directly
        // (can't use parseFolderName — it expects a full folder name with leading date)
        const venueCity = rest
          .replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '').trim()
        const m1 = venueCity.match(/^(.+?)\s*-\s*([^,\-]+),\s*([A-Z]{2,3})$/)
        if (m1) {
          tagVenue = m1[1].trim(); tagCity = m1[2].trim(); tagState = m1[3].trim()
        } else {
          const parts = venueCity.split(',').map((p: string) => p.trim()).filter(Boolean)
          if (parts.length >= 3 && /^[A-Z]{2,3}$/.test(parts[parts.length - 1])) {
            tagState = parts[parts.length - 1]
            tagCity = parts[parts.length - 2]
            tagVenue = parts.slice(0, parts.length - 2).join(', ')
          } else if (parts.length >= 3) {
            // "Venue, City, Country" — no 2-letter state
            tagState = parts[parts.length - 1]
            tagCity = parts[parts.length - 2]
            tagVenue = parts.slice(0, parts.length - 2).join(', ')
          } else if (parts.length === 2) {
            tagVenue = parts[0]
            const cityState = parts[1].match(/^(.+?)\s+([A-Z]{2,3})$/)
            if (cityState) { tagCity = cityState[1].trim(); tagState = cityState[2] }
            else tagCity = parts[1]
          } else if (parts.length === 1) {
            tagVenue = parts[0]
          }
        }
      }
    }
  }

  const date = normalizeDate(parsed.date || tagDate || '')
  // If folder venue is a placeholder, prefer tag-derived venue
  const folderVenue = parsedVenue || parsed.venue || ''
  const isPlaceholderVenue = /^unknown\s*venue$/i.test(folderVenue.trim())
  const venue = (!folderVenue || isPlaceholderVenue) ? (tagVenue || folderVenue) : folderVenue
  // Prefer tag city/state if folder city is missing OR suspiciously short (e.g. "Sun" truncated from "Sunrise")
  const folderCity = parsed.city || ''
  const folderState = parsed.state || ''
  const folderCityTruncated = folderCity.length > 0 && folderCity.length <= 3 && tagCity && tagCity.toLowerCase().startsWith(folderCity.toLowerCase())
  const city = (folderCityTruncated || !folderCity || isPlaceholderVenue) ? (tagCity || folderCity) : folderCity
  const state = (!folderState || isPlaceholderVenue) ? (tagState || folderState) : folderState

  const hasFlac = files.some(f => path.extname(f).toLowerCase() === '.flac')
  const hasMp3 = files.some(f => path.extname(f).toLowerCase() === '.mp3')

  const tagFields = [tagsFromFile.artist, tagsFromFile.album, tagsFromFile.title, tagsFromFile.tracknumber]
  const presentCount = tagFields.filter(Boolean).length
  const tagStatus: 'full' | 'partial' | 'none' =
    presentCount === 0 ? 'none' : presentCount === 4 ? 'full' : 'partial'

  const { score, issues } = scoreHealth(artist, date, venue, files, tagStatus)

  const libraryFiles: LibraryFile[] = files.map((f, i) => ({
    filePath: f,
    filename: path.basename(f),
    ext: path.extname(f).toLowerCase(),
    existingTags: i === 0 ? tagsFromFile : {},
  }))

  return {
    id: Buffer.from(folderPath).toString('base64'),
    folderPath,
    sourcePath,
    releaseType,
    artist,
    date,
    venue,
    city,
    state,
    albumTitle: albumTitleParsed || tagsFromFile.album || '',
    year: albumYear || tagsFromFile.date?.slice(0, 4) || '',
    healthScore: score,
    healthIssues: issues,
    fileCount: files.length,
    hasFlac,
    hasMp3,
    tagStatus,
    alreadyDone: false, // overwritten by markDone in scanLibrary
    files: libraryFiles,
  }
}

// Build a set of "done" keys from the destination folder (artist|date or artist|albumtitle)
function buildDoneSet(destinationRoot: string): Map<string, string> {
  const done = new Map<string, string>() // key → destFolderPath
  if (!destinationRoot || !fs.existsSync(destinationRoot)) return done
  try {
    const artistDirs = fs.readdirSync(destinationRoot, { withFileTypes: true }).filter(e => e.isDirectory())
    for (const artistDir of artistDirs) {
      const artistPath = path.join(destinationRoot, artistDir.name)
      const showDirs = fs.readdirSync(artistPath, { withFileTypes: true }).filter(e => e.isDirectory())
      for (const showDir of showDirs) {
        const folderName = showDir.name
        const destPath = path.join(artistPath, folderName)
        // Extract date from folder name
        const dateMatch = folderName.match(/^(\d{4}-\d{2}-\d{2})/)
        const artistKey = normalizeArtist(artistDir.name).toLowerCase()
        if (dateMatch) {
          done.set(`${artistKey}|${dateMatch[1]}`, destPath)
        } else {
          // Album: use normalised folder name
          const albumKey = folderName.toLowerCase().replace(/\s*\(.*?\)/g, '').trim()
          done.set(`${artistKey}|${albumKey}`, destPath)
        }
      }
    }
  } catch { /* ignore */ }
  return done
}

export async function scanLibrary(
  sources: string[],
  onEvent: (event: ScanEvent) => void,
  destinationRoot?: string
): Promise<void> {
  const allShows: LibraryShow[] = []
  let current = 0
  const doneSet = buildDoneSet(destinationRoot || '')

  for (const sourceRoot of sources) {
    if (!fs.existsSync(sourceRoot)) {
      onEvent({ type: 'progress', msg: `Skipping (not found): ${path.basename(sourceRoot)}`, current })
      continue
    }

    let rootDirs: fs.Dirent[]
    try {
      rootDirs = fs.readdirSync(sourceRoot, { withFileTypes: true }).filter(e => e.isDirectory())
    } catch {
      continue
    }

    // Detect if source IS itself a show folder:
    // - has audio files directly at root, OR
    // - immediate subdirs all look like disc folders (d1, d2, Disc 1, Set I, etc.)
    const rootEntries = fs.readdirSync(sourceRoot, { withFileTypes: true })
    const rootAudioFiles = rootEntries.filter(e => e.isFile() && AUDIO_EXTENSIONS.includes(path.extname(e.name).toLowerCase()))
    const rootSubdirs = rootEntries.filter(e => e.isDirectory())
    const allSubdirsAreDiscs = rootSubdirs.length > 0 && rootSubdirs.every(e => parseDiscFromFolder(e.name) !== null)
    if (rootAudioFiles.length > 0 || allSubdirsAreDiscs) {
      onEvent({ type: 'progress', msg: `Scanning: ${path.basename(sourceRoot)}`, current })
      const parentArtist = path.basename(path.dirname(sourceRoot))
      const show = await buildShow(sourceRoot, path.dirname(sourceRoot), parentArtist)
      if (show) {
        const artistKey = normalizeArtist(show.artist).toLowerCase()
        const dateKey = show.date ? `${artistKey}|${show.date}` : null
        const albumKey = show.albumTitle ? `${artistKey}|${show.albumTitle.toLowerCase().trim()}` : null
        const destPath = (dateKey && doneSet.get(dateKey)) || (albumKey && doneSet.get(albumKey)) || null
        allShows.push({ ...show, alreadyDone: !!destPath, destinationPath: destPath || undefined })
        current++
      }
      continue
    }

    // Detect structure: if direct children look like date-prefixed show folders → flat
    const isFlatStructure = rootDirs.some(e => /^\d{4}-\d{2}-\d{2}/.test(e.name))

    const markDone = (show: LibraryShow): LibraryShow => {
      const artistKey = normalizeArtist(show.artist).toLowerCase()
      const dateKey = show.date ? `${artistKey}|${show.date}` : null
      const albumKey = show.albumTitle ? `${artistKey}|${show.albumTitle.toLowerCase().trim()}` : null
      const destPath = (dateKey && doneSet.get(dateKey)) || (albumKey && doneSet.get(albumKey)) || null
      return { ...show, alreadyDone: !!destPath, destinationPath: destPath || undefined }
    }

    if (isFlatStructure) {
      // Flat: sourceRoot/YYYY-MM-DD Show/
      for (const dir of rootDirs) {
        const showDir = path.join(sourceRoot, dir.name)
        onEvent({ type: 'progress', msg: `Scanning: ${dir.name}`, current })
        const show = await buildShow(showDir, sourceRoot, null)
        if (show) { allShows.push(markDone(show)); current++ }
      }
    } else {
      // Artist subfolder: sourceRoot/Artist/YYYY-MM-DD Show/
      for (const artistDir of rootDirs) {
        const artistPath = path.join(sourceRoot, artistDir.name)
        let showDirs: fs.Dirent[]
        try {
          showDirs = fs.readdirSync(artistPath, { withFileTypes: true }).filter(e => e.isDirectory())
        } catch { continue }

        // Also handle: artist folder has audio files directly (Bisco Mixes etc.)
        const artistAudioFiles = collectAudioFiles(artistPath)
        if (artistAudioFiles.length > 0 && showDirs.length === 0) {
          onEvent({ type: 'progress', msg: `Scanning: ${artistDir.name} (loose files)`, current })
          const show = await buildShow(artistPath, sourceRoot, null)
          if (show) { allShows.push(markDone(show)); current++ }
        }

        // Check if ALL show subdirs are disc folders (CD 01, CD 02, Disc 1, etc.)
        // If so, this IS the album folder — build a single show from it, not separate per-disc shows
        const allShowDirsAreDiscs = showDirs.length > 0 && showDirs.every(e => parseDiscFromFolder(e.name) !== null)
        if (allShowDirsAreDiscs) {
          onEvent({ type: 'progress', msg: `Scanning: ${artistDir.name} (multi-disc)`, current })
          const show = await buildShow(artistPath, sourceRoot, null)
          if (show) { allShows.push(markDone(show)); current++ }
          continue
        }

        for (const showDir of showDirs) {
          const showPath = path.join(artistPath, showDir.name)
          // Check if this show folder's children are all disc folders
          try {
            const showSubdirs = fs.readdirSync(showPath, { withFileTypes: true }).filter(e => e.isDirectory())
            const showHasAudio = fs.readdirSync(showPath, { withFileTypes: true }).some(e => e.isFile() && AUDIO_EXTENSIONS.includes(path.extname(e.name).toLowerCase()))
            if (!showHasAudio && showSubdirs.length > 0 && showSubdirs.every(e => parseDiscFromFolder(e.name) !== null)) {
              // Multi-disc album inside artist/show folder
              onEvent({ type: 'progress', msg: `Scanning: ${artistDir.name} / ${showDir.name} (multi-disc)`, current })
              const show = await buildShow(showPath, sourceRoot, artistDir.name)
              if (show) { allShows.push(markDone(show)); current++ }
              continue
            }
          } catch { /* fall through to normal handling */ }

          onEvent({ type: 'progress', msg: `Scanning: ${artistDir.name} / ${showDir.name}`, current })
          const show = await buildShow(showPath, sourceRoot, artistDir.name)
          if (show) {
            allShows.push(markDone(show)); current++
          } else {
            // No audio found directly — check one more level deep
            // Handles: Artist - Album (Year)/ArtistName/tracks.flac
            try {
              const deepDirs = fs.readdirSync(showPath, { withFileTypes: true }).filter(e => e.isDirectory())
              for (const deepDir of deepDirs) {
                const deepPath = path.join(showPath, deepDir.name)
                // Use parent folder name as album hint, grandparent as artist hint
                const deepShow = await buildShow(deepPath, sourceRoot, artistDir.name)
                if (deepShow) {
                  // Override album title from parent folder if not already set
                  if (!deepShow.albumTitle) {
                    const parentParsed = parseFolderName(showDir.name)
                    if (parentParsed.date) {
                      deepShow.date = deepShow.date || parentParsed.date
                      deepShow.venue = deepShow.venue || parentParsed.venue || ''
                    } else {
                      // It's an album folder like "Grateful Dead - It Must Have Been the Roses (2024) [FLAC]"
                      const yearMatch = showDir.name.match(/\((\d{4})\)/)
                      if (yearMatch) {
                        deepShow.releaseType = 'album'
                        deepShow.year = deepShow.year || yearMatch[1]
                        deepShow.albumTitle = deepShow.albumTitle ||
                          showDir.name.replace(/\s*\[.*?\]/g, '').replace(/\s*\(.*?\)/g, '')
                            .replace(new RegExp(`^${deepShow.artist}\\s*[-–]\\s*`, 'i'), '').trim()
                      }
                    }
                  }
                  onEvent({ type: 'progress', msg: `Scanning: ${artistDir.name} / ${showDir.name} / ${deepDir.name}`, current })
                  allShows.push(markDone(deepShow)); current++
                }
              }
            } catch { /* ignore */ }
          }
        }
      }
    }
  }

  onEvent({ type: 'done', shows: allShows })
}

export function deduplicateShows(shows: LibraryShow[]): {
  unique: LibraryShow[]
  duplicateGroups: DuplicateGroup[]
} {
  const groups = new Map<string, LibraryShow[]>()

  for (const show of shows) {
    const key = `${normalizeArtist(show.artist).toLowerCase()}|${show.date}`
    const g = groups.get(key)
    if (g) g.push(show)
    else groups.set(key, [show])
  }

  const unique: LibraryShow[] = []
  const duplicateGroups: DuplicateGroup[] = []

  for (const [key, group] of groups) {
    if (group.length === 1) {
      unique.push(group[0])
      continue
    }

    const scored = group
      .map(s => ({
        show: s,
        score: (s.hasFlac ? 50 : 0) + s.fileCount * 2 + s.healthScore / 10 + (s.tagStatus === 'full' ? 10 : 0),
      }))
      .sort((a, b) => b.score - a.score)

    const winner = scored[0].show
    const winnerReasonParts = [
      winner.hasFlac ? 'FLAC' : 'MP3',
      `${winner.fileCount} tracks`,
      winner.tagStatus === 'full' ? 'fully tagged' : '',
    ].filter(Boolean)

    duplicateGroups.push({
      key,
      shows: scored.map(({ show }) => ({
        ...show,
        isWinner: show.id === winner.id,
        winnerReason: show.id === winner.id ? winnerReasonParts.join(', ') : '',
      })),
    })

    unique.push(winner)
  }

  return { unique, duplicateGroups }
}

export function cleanTrackTitle(filename: string, ext: string): string {
  const base = path.basename(filename, ext)
  let s = base
    // Strip embedded format/quality suffixes: .flac24, .flac16, .flac, .V0, .320, .mp3 etc.
    .replace(/\.(?:flac\d*|mp3|wav|aac|ogg|m4a|v\d+|\d{3})\s*$/i, '')
    // Strip catalog prefix: A071_, B002_, etc. (letter(s) + digits + underscore before track number)
    .replace(/^[A-Z]{1,4}\d{2,5}[_\s]+/i, '')
    // taper prefix + YYYY-MM-DD + disc + track: gd1977-05-08d1t01
    .replace(/^[a-z]{2,10}\d{4}-\d{2}-\d{2}d\d+t\d+[-_]?\s*/i, '')
    // taper prefix + date + disc + track: spacebacon240127d1_01_Title or sb2024-01-27d1t01Title
    .replace(/^[a-z]{2,20}\d{2,8}-?\d{0,2}-?\d{0,2}d\d+[_t]\d+[-_]?\s*/i, '')
    // taper prefix + compact date + disc + track: db251122d1_01
    .replace(/^[a-z]{2,10}\d{6,8}d\d+[_t]\d+[-_]?\s*/i, '')
    // d1-01, d1_01, d1t01, d1_t01, d201  — MUST run before YYYY strip
    .replace(/^d\d+[-_]?t\d+[-_]?\s*/i, '')   // d1_t01, d1t01
    .replace(/^d\d+[-_]\d+[-_]?\s*/i, '')      // d1-01, d1_01
    .replace(/^d\d{3,4}\s*[-_]?\s*/i, '')      // d201
    // N-NN Title (disc-track without d prefix: "1-01 Carini" → "Carini")
    .replace(/^\d-\d{2}\s+/, '')
    // 01 - Title or 01 – Title or 01_Title
    .replace(/^\d{1,3}\s*[-–—_.]\s*/, '')
    // double track prefix: "01 01 – Title" or "01 01 - Title" → "Title"
    .replace(/^\d{1,3}\s+\d{1,3}\s*[-–—]\s*/, '')
    // bare leading number leftover: "01 Carini" → "Carini"
    .replace(/^\d{1,2}\s+(?=[A-Z])/i, '')
    // "Drive-By Truckers - 01 - Title" — strip "Artist - " or "Artist - 01 - " prefix
    // Split on first " - " outside parens; only strip if prefix looks like an artist (has letters, not a date)
    .replace(/^([^(–—]*?)\s+[-–—]\s+(?:\d{1,3}\s+[-–—]\s+)?(?=\S)/, (match, prefix) => {
      // Don't strip if prefix is just a date like "10-31-78" or numbers
      if (/^\d[\d\-_\/\.]+$/.test(prefix.trim())) return match
      // Don't strip if prefix doesn't contain at least 2 consecutive letters (not an artist name)
      if (!/[a-zA-Z]{2}/.test(prefix)) return match
      return ''
    })

  // After stripping disc/track prefix, YYYY-prefixed remainder may be exposed:
  // "2002 - 10-05d1t01 Hot Air Balloon" or "2007 - 11-01d1t01-Astronaut"
  s = s
    .replace(/^\d{4}\s*-\s*\d{2}-\d{2}d\d+t\d+[-_]?\s*/i, '')
    // nugs-style tNN_ infix: "t01_Intro" → "Intro"
    .replace(/^t\d+[-_]\s*/i, '')
    // strip leading dash/space leftover
    .replace(/^[-\s]+/, '')
    // strip trailing "(Live at ...)" / "(Live from ...)" venue suffixes
    .replace(/\s*\(live\s+(?:at|from|in)\b[^)]*\)/gi, '')
    .replace(/\s*\(live\s*\)/gi, '')
    // replace remaining underscores with spaces
    .replace(/[_]+/g, ' ')
    .trim()

  // Title-case if ALL CAPS (e.g. "NEW RIVER TRAIN" → "New River Train")
  if (s.length > 2 && s === s.toUpperCase() && /[A-Z]/.test(s)) {
    const minorWords = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'yet', 'so', 'in', 'on', 'at', 'to', 'of', 'by', 'up', 'is'])
    s = s.toLowerCase().replace(/\b\w+/g, (word, idx) => {
      if (idx === 0 || !minorWords.has(word)) return word.charAt(0).toUpperCase() + word.slice(1)
      return word
    })
  }

  return s
}

export function suggestShow(show: LibraryShow): LibraryShowSuggestion {
  const artist = normalizeArtist(show.artist)
  const { date, venue, city, state, releaseType, albumTitle, year } = show

  const isAlbum = releaseType === 'album'

  const proposedFolderName = isAlbum
    ? [albumTitle, year ? `(${year})` : ''].filter(Boolean).join(' ')
    : [date, venue, [city, state].filter(Boolean).join(', ')].filter(Boolean).join(' ')

  // Track counter per disc for proper track numbering
  const discTrackCounters = new Map<number, number>()
  let globalTrack = 0

  const proposedFiles = show.files.map((f) => {
    const base = path.basename(f.filename, f.ext)

    // Detect disc from filename: "2-01 Title", "d2-01 Title", "d2_01 Title"
    const discMatch = base.match(/^(?:d)?(\d)-(\d{2})\s/) || base.match(/^d(\d+)[_-](\d+)/)
    let disc = 1
    let track = 0

    if (discMatch) {
      disc = parseInt(discMatch[1], 10)
      track = parseInt(discMatch[2], 10)
    } else {
      globalTrack++
      track = globalTrack
    }

    const cleanTitle = cleanTrackTitle(f.filename, f.ext) || `Track ${track}`
    const trackStr = String(track).padStart(2, '0')
    const proposedFilename = isAlbum
      ? `${trackStr} ${cleanTitle}${f.ext}`
      : `d${disc}-${trackStr} ${cleanTitle}${f.ext}`
    return { originalFilename: f.filename, proposedFilename }
  })

  return {
    showId: show.id,
    originalShow: show,
    releaseType: releaseType || 'live',
    artist,
    date,
    venue,
    city,
    state,
    source: '',
    albumTitle: albumTitle || '',
    year: year || '',
    proposedFolderName,
    proposedFiles,
  }
}

function sanitize(str: string): string {
  return str
    // Normalize all Unicode hyphen/dash variants to ASCII hyphen
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function applyBatch(
  items: Array<{ suggestion: LibraryShowSuggestion; destinationRoot: string }>,
  onResult: (result: BatchApplyResult) => void
): Promise<void> {
  const tools = checkToolsAvailable()

  for (const { suggestion, destinationRoot } of items) {
    const { originalShow } = suggestion
    try {
      const artistDir = sanitize(suggestion.artist || 'Unknown Artist')
      const albumDir = sanitize(suggestion.proposedFolderName || suggestion.date || 'Unknown Date')
      const destDir = path.join(destinationRoot, artistDir, albumDir)
      fs.mkdirSync(destDir, { recursive: true })

      const isAlbum = suggestion.releaseType === 'album'
      const albumName = isAlbum
        ? [suggestion.albumTitle, suggestion.year ? `(${suggestion.year})` : ''].filter(Boolean).join(' ')
        : [suggestion.date, suggestion.venue, [suggestion.city, suggestion.state].filter(Boolean).join(', ')].filter(Boolean).join(' ')

      let filesProcessed = 0
      for (let i = 0; i < originalShow.files.length; i++) {
        const file = originalShow.files[i]
        const proposed = suggestion.proposedFiles[i]
        if (!proposed) continue

        const destFilePath = path.join(destDir, sanitize(proposed.proposedFilename))
        fs.copyFileSync(file.filePath, destFilePath)
        filesProcessed++

        const ext = file.ext
        if (ext === '.flac' || ext === '.mp3') {
          const toolAvailable = ext === '.flac' ? tools.metaflac : tools.id3v2
          if (toolAvailable) {
            const trackTitle = normalizeTitle(
              path.basename(proposed.proposedFilename, ext)
                .replace(/^d\d+[-_]\d+\s*/, '').replace(/^\d+\s*/, '').trim()
            )
            writeTags(destFilePath, {
              artist: normalizeArtist(suggestion.artist),
              album: normalizeUnicode(albumName),
              title: trackTitle,
              tracknumber: String(i + 1),
              discnumber: isAlbum ? '' : '1',
              date: isAlbum ? (suggestion.year || '') : suggestion.date,
              comment: isAlbum ? '' : (suggestion.source || ''),
            })
          }
        }
      }

      // Copy any image files from source folder (cover.jpg, folder.jpg, etc.) — don't overwrite existing
      const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
      const sourceDirs = new Set(originalShow.files.map(f => path.dirname(f.filePath)))
      sourceDirs.add(originalShow.folderPath)
      for (const srcDir of sourceDirs) {
        try {
          const entries = fs.readdirSync(srcDir, { withFileTypes: true })
          for (const entry of entries) {
            if (!entry.isFile()) continue
            const ext = path.extname(entry.name).toLowerCase()
            if (!IMAGE_EXTS.includes(ext)) continue
            const destImg = path.join(destDir, entry.name)
            if (!fs.existsSync(destImg)) {
              fs.copyFileSync(path.join(srcDir, entry.name), destImg)
            }
          }
        } catch { /* skip unreadable dirs */ }
      }
      // Ensure cover.jpg always exists (Jellyfin standard) — copy from folder.jpg if needed
      const coverJpg = path.join(destDir, 'cover.jpg')
      const folderJpg = path.join(destDir, 'folder.jpg')
      if (!fs.existsSync(coverJpg) && fs.existsSync(folderJpg)) {
        fs.copyFileSync(folderJpg, coverJpg)
      }

      onResult({ showId: suggestion.showId, success: true, destinationPath: destDir, filesProcessed })
    } catch (err) {
      onResult({
        showId: suggestion.showId,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        filesProcessed: 0,
      })
    }
  }
}
