import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import multer from 'multer'
import { scanFolder } from './scanner.js'
import { writeTags, checkToolsAvailable } from './tagger.js'
import { renameAndMove, buildPreview, buildAlbumName, RenameTarget } from './renamer.js'
import {
  scanLibrary,
  deduplicateShows,
  suggestShow,
  applyBatch,
  LibraryShow,
  LibraryShowSuggestion,
} from './library.js'
import { fetchArtistPhoto, generateShowPoster, saveArtwork, searchAlbumArt } from './artwork.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.set('query parser', 'extended')
const PORT = 7337
const RECENTS_FILE = path.join(__dirname, '..', '.taperkit-recents.json')

const upload = multer({ storage: multer.memoryStorage() })

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))

// --- Recents helpers ---

function loadRecents(): string[] {
  try {
    if (fs.existsSync(RECENTS_FILE)) {
      const data = fs.readFileSync(RECENTS_FILE, 'utf-8')
      return JSON.parse(data) as string[]
    }
  } catch {
    // ignore
  }
  return []
}

function saveRecents(recents: string[]): void {
  try {
    fs.writeFileSync(RECENTS_FILE, JSON.stringify(recents, null, 2))
  } catch {
    // ignore
  }
}

function addToRecents(folderPath: string): void {
  const recents = loadRecents()
  const filtered = recents.filter(r => r !== folderPath)
  filtered.unshift(folderPath)
  saveRecents(filtered.slice(0, 10))
}

// --- API Routes ---

// GET /api/scan?path=...
app.get('/api/scan', async (req, res) => {
  const folderPath = req.query.path as string
  if (!folderPath) {
    return res.status(400).json({ error: 'path query parameter required' })
  }

  try {
    const show = await scanFolder(folderPath)
    addToRecents(folderPath)
    return res.json(show)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
})

// POST /api/apply
app.post('/api/apply', async (req, res) => {
  const { show, outputDir, writeTags: shouldWriteTags = true } = req.body as {
    show: {
      releaseType?: 'live' | 'album'
      artist: string
      date: string
      venue: string
      city: string
      state: string
      source: string
      notes: string
      albumTitle?: string
      year?: string
      tracks: Array<{
        filePath: string
        disc: number
        track: number
        title: string
      }>
    }
    outputDir: string
    writeTags: boolean
  }

  if (!show || !outputDir) {
    return res.status(400).json({ error: 'show and outputDir are required' })
  }

  const tools = checkToolsAvailable()
  const results: Array<{
    filePath: string
    targetFilePath: string
    renamed: boolean
    tagged: boolean
    errors: string[]
  }> = []

  const targets: RenameTarget[] = show.tracks.map(track => ({
    sourceFilePath: track.filePath,
    disc: track.disc,
    track: track.track,
    title: track.title,
    artist: show.artist,
    date: show.date,
    venue: show.venue,
    city: show.city,
    state: show.state,
    source: show.source,
    notes: show.notes,
  }))

  const renameResults = renameAndMove(targets, outputDir)

  const isAlbum = show.releaseType === 'album'
  const albumName = isAlbum
    ? [show.albumTitle, show.year ? `(${show.year})` : ''].filter(Boolean).join(' ')
    : buildAlbumName(show.date, show.venue, show.city, show.state)

  for (let i = 0; i < renameResults.length; i++) {
    const renameResult = renameResults[i]
    const track = show.tracks[i]
    const errors: string[] = []

    if (!renameResult.success && renameResult.error) {
      errors.push(`Rename failed: ${renameResult.error}`)
    }

    let tagged = false
    if (shouldWriteTags && renameResult.success) {
      const ext = path.extname(renameResult.targetFilePath).toLowerCase()
      const tagData = {
        artist: show.artist,
        album: albumName,
        title: track.title,
        tracknumber: String(track.track),
        discnumber: isAlbum ? '' : String(track.disc),
        date: isAlbum ? (show.year || '') : show.date,
        comment: isAlbum ? '' : [show.source, show.notes].filter(Boolean).join(' | '),
      }

      const supported = ext === '.flac' || ext === '.mp3'
      const toolAvailable = ext === '.flac' ? tools.metaflac : tools.id3v2

      if (!supported) {
        errors.push(`Tag writing not supported for ${ext}`)
      } else if (!toolAvailable) {
        const toolName = ext === '.flac' ? 'metaflac' : 'id3v2'
        errors.push(`${toolName} not installed — tags not written`)
      } else {
        const tagResult = writeTags(renameResult.targetFilePath, tagData)
        if (!tagResult.success && tagResult.error) {
          errors.push(`Tag write failed: ${tagResult.error}`)
        } else {
          tagged = true
        }
      }
    }

    results.push({
      filePath: track.filePath,
      targetFilePath: renameResult.targetFilePath,
      renamed: renameResult.success,
      tagged,
      errors,
    })
  }

  return res.json({ results, tools })
})

// GET /api/preview
app.post('/api/preview', (req, res) => {
  const { show, outputDir } = req.body as {
    show: {
      releaseType?: 'live' | 'album'
      artist: string
      date: string
      venue: string
      city: string
      state: string
      source: string
      notes: string
      albumTitle?: string
      year?: string
      tracks: Array<{
        filePath: string
        disc: number
        track: number
        title: string
      }>
    }
    outputDir: string
  }

  if (!show || !outputDir) {
    return res.status(400).json({ error: 'show and outputDir are required' })
  }

  const targets: RenameTarget[] = show.tracks.map(track => ({
    sourceFilePath: track.filePath,
    disc: track.disc,
    track: track.track,
    title: track.title,
    artist: show.artist,
    releaseType: show.releaseType || 'live',
    date: show.date,
    venue: show.venue,
    city: show.city,
    state: show.state,
    source: show.source,
    notes: show.notes,
    albumTitle: show.albumTitle,
    year: show.year,
  }))

  const preview = buildPreview(targets, outputDir)
  return res.json(preview)
})

// GET /api/browse — open macOS Finder folder picker dialog
app.get('/api/browse', (_req, res) => {
  try {
    const script = `tell application "Finder" to set theFolder to choose folder with prompt "Choose a show folder"
return POSIX path of theFolder`
    const result = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { encoding: 'utf-8' }).trim()
    return res.json({ path: result })
  } catch (err) {
    // User cancelled — not an error
    return res.json({ path: null })
  }
})

// GET /api/recent
app.get('/api/recent', (_req, res) => {
  return res.json(loadRecents())
})

// POST /api/recent
app.post('/api/recent', (req, res) => {
  const { path: folderPath } = req.body as { path: string }
  if (!folderPath) {
    return res.status(400).json({ error: 'path is required' })
  }
  addToRecents(folderPath)
  return res.json({ ok: true })
})

// GET /api/tools
app.get('/api/tools', (_req, res) => {
  return res.json(checkToolsAvailable())
})

// --- Library API Routes ---

// GET /api/library/scan?sources[]=path1&sources[]=path2  (SSE stream)
app.get('/api/library/scan', async (req, res) => {
  // Accept both sources[] and sources as array keys
  const raw = req.query['sources[]'] ?? req.query['sources']
  const sources: string[] = Array.isArray(raw) ? (raw as string[]) : raw ? [raw as string] : []
  if (sources.length === 0) {
    return res.status(400).json({ error: 'sources[] query parameter required' })
  }
  const destination = (req.query['destination'] as string) || ''

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  try {
    await scanLibrary(sources, send, destination)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    send({ type: 'error', message })
  }

  res.end()
})

// POST /api/library/deduplicate
app.post('/api/library/deduplicate', (req, res) => {
  const { shows } = req.body as { shows: LibraryShow[] }
  if (!shows || !Array.isArray(shows)) {
    return res.status(400).json({ error: 'shows array required' })
  }
  return res.json(deduplicateShows(shows))
})

// POST /api/library/suggest
app.post('/api/library/suggest', (req, res) => {
  const { show } = req.body as { show: LibraryShow }
  if (!show) {
    return res.status(400).json({ error: 'show object required' })
  }
  return res.json(suggestShow(show))
})

// GET /api/itunes-art?artist=...&album=...  — proxy iTunes artwork lookup (avoids browser CORS)
app.get('/api/itunes-art', async (req, res) => {
  const artist = req.query.artist as string || ''
  const album = req.query.album as string || ''
  if (!artist && !album) return res.status(400).json({ error: 'artist or album required' })
  try {
    const q = encodeURIComponent(`${artist} ${album}`.trim())
    const r = await fetch(`https://itunes.apple.com/search?term=${q}&entity=album&limit=5`)
    const data = await r.json() as { results?: Array<{ artworkUrl100?: string; collectionName?: string; artistName?: string }> }
    const results = data.results || []
    const exact = results.find(r => r.collectionName?.toLowerCase() === album.toLowerCase()) || results[0]
    if (!exact?.artworkUrl100) return res.status(404).json({ error: 'no artwork' })
    const artworkUrl = exact.artworkUrl100.replace('100x100bb', '600x600bb')
    return res.json({ artworkUrl, collectionName: exact.collectionName, artistName: exact.artistName })
  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
})

// GET /api/artwork?file=<path>  — extract embedded artwork from audio file
app.get('/api/artwork', async (req, res) => {
  const filePath = req.query.file as string
  if (!filePath) return res.status(400).json({ error: 'file query required' })
  try {
    const mm = await import('music-metadata')
    const metadata = await mm.parseFile(filePath, { duration: false })
    const pic = metadata.common.picture?.[0]
    if (!pic) return res.status(404).json({ error: 'no artwork' })
    res.setHeader('Content-Type', pic.format || 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.send(Buffer.from(pic.data))
  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
})

// POST /api/library/apply-batch  (streaming NDJSON)
app.post('/api/library/apply-batch', async (req, res) => {
  const { items, destinationRoot } = req.body as {
    items: Array<{ suggestion: LibraryShowSuggestion }>
    destinationRoot: string
  }
  if (!items || !destinationRoot) {
    return res.status(400).json({ error: 'items and destinationRoot required' })
  }

  res.setHeader('Content-Type', 'application/x-ndjson')
  res.setHeader('Transfer-Encoding', 'chunked')
  res.setHeader('X-Accel-Buffering', 'no')

  await applyBatch(
    items.map(item => ({ suggestion: item.suggestion, destinationRoot })),
    result => { res.write(JSON.stringify(result) + '\n') }
  )

  res.end()
})

// --- Artwork API Routes ---

// GET /api/artwork/search-album?artist=The+Disco+Biscuits&album=Wind+at+Four+to+Fly
app.get('/api/artwork/search-album', async (req, res) => {
  const artist = req.query.artist as string
  const album = req.query.album as string
  if (!artist || !album) return res.json({ dataUrl: null })
  try {
    const dataUrl = await searchAlbumArt(artist, album)
    return res.json({ dataUrl })
  } catch (err) {
    return res.json({ dataUrl: null })
  }
})

// GET /api/artwork/fetch-artist?artist=Widespread+Panic
app.get('/api/artwork/fetch-artist', async (req, res) => {
  const artist = req.query.artist as string
  if (!artist) return res.status(400).json({ error: 'artist query parameter required' })
  try {
    const dataUrl = await fetchArtistPhoto(artist)
    return res.json({ dataUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
})

// POST /api/artwork/generate-poster
app.post('/api/artwork/generate-poster', (req, res) => {
  const { artist, date, venue, city, state } = req.body as {
    artist: string; date: string; venue: string; city: string; state: string
  }
  try {
    const dataUrl = generateShowPoster({ artist, date, venue, city, state })
    return res.json({ dataUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
})

// POST /api/artwork/save  — body: { destDir, artistDir, dataUrl }
app.post('/api/artwork/save', (req, res) => {
  const { destDir, artistDir, dataUrl } = req.body as {
    destDir: string; artistDir?: string; dataUrl: string
  }
  if (!destDir || !dataUrl) return res.status(400).json({ error: 'destDir and dataUrl required' })
  try {
    saveArtwork(path.join(destDir, 'folder.jpg'), dataUrl)
    if (artistDir) {
      const artistArt = path.join(artistDir, 'folder.jpg')
      if (!fs.existsSync(artistArt)) {
        saveArtwork(artistArt, dataUrl)
      }
    }
    return res.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
})

// POST /api/artwork/upload  — multipart: file + destDir + artistDir
app.post('/api/artwork/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' })
  const { destDir, artistDir } = req.body as { destDir: string; artistDir?: string }
  if (!destDir) return res.status(400).json({ error: 'destDir required' })
  try {
    const destPath = path.join(destDir, 'folder.jpg')
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
    fs.writeFileSync(destPath, req.file.buffer)
    if (artistDir) {
      const artistPath = path.join(artistDir, 'folder.jpg')
      if (!fs.existsSync(artistPath)) {
        if (!fs.existsSync(artistDir)) fs.mkdirSync(artistDir, { recursive: true })
        fs.writeFileSync(artistPath, req.file.buffer)
      }
    }
    return res.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
})

// GET /api/artwork/existing?dir=/path/to/folder
// Returns existing artwork images found in a folder as base64 data URLs
app.get('/api/artwork/existing', (req, res) => {
  const dir = req.query.dir as string
  if (!dir) return res.json({ images: [] })

  const imageNames = ['folder.jpg', 'folder.png', 'cover.jpg', 'cover.png', 'front.jpg', 'front.png', 'album.jpg', 'album.png']
  const found: Array<{ name: string; dataUrl: string }> = []

  try {
    for (const name of imageNames) {
      const fullPath = path.join(dir, name)
      if (fs.existsSync(fullPath)) {
        const ext = path.extname(name).toLowerCase()
        const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
        const data = fs.readFileSync(fullPath)
        found.push({ name, dataUrl: `data:${mime};base64,${data.toString('base64')}` })
      }
    }
    // Also check for any other jpg/png in the folder
    const entries = fs.readdirSync(dir)
    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase()
      if ((ext === '.jpg' || ext === '.png') && !imageNames.includes(entry.toLowerCase())) {
        const fullPath = path.join(dir, entry)
        const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
        const data = fs.readFileSync(fullPath)
        found.push({ name: entry, dataUrl: `data:${mime};base64,${data.toString('base64')}` })
      }
    }
  } catch { /* dir doesn't exist yet */ }

  return res.json({ images: found })
})

// Serve built frontend in production (when dist/ exists)
const distPath = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`TaperKit running on http://localhost:${PORT}`)
  // Auto-open browser in production mode
  if (fs.existsSync(distPath)) {
    const url = `http://localhost:${PORT}`
    const cmd = process.platform === 'darwin' ? `open "${url}"` :
                process.platform === 'win32' ? `start "${url}"` : `xdg-open "${url}"`
    import('child_process').then(({ execSync }) => {
      try { execSync(cmd) } catch { /* ignore */ }
    })
  }
})
