import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { scanFolder } from './scanner.js'
import { writeTags, checkToolsAvailable } from './tagger.js'
import { renameAndMove, buildPreview, RenameTarget } from './renamer.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = 7337
const RECENTS_FILE = path.join(__dirname, '..', '.taperkit-recents.json')

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
      artist: string
      date: string
      venue: string
      city: string
      state: string
      source: string
      notes: string
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

  const albumName = [show.date, show.venue, show.city && show.state ? `${show.city}, ${show.state}` : show.city]
    .filter(Boolean)
    .join(' ')

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
        discnumber: String(track.disc),
        date: show.date,
        comment: [show.source, show.notes].filter(Boolean).join(' | '),
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
      artist: string
      date: string
      venue: string
      city: string
      state: string
      source: string
      notes: string
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
    date: show.date,
    venue: show.venue,
    city: show.city,
    state: show.state,
    source: show.source,
    notes: show.notes,
  }))

  const preview = buildPreview(targets, outputDir)
  return res.json(preview)
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

app.listen(PORT, () => {
  console.log(`TaperKit server running on http://localhost:${PORT}`)
})
