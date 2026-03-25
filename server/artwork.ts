import { createCanvas } from 'canvas'
import fs from 'fs'
import path from 'path'

// Wrap text to fit within maxWidth, returning lines
function wrapText(ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (ctx.measureText(test).width <= maxWidth) {
      current = test
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

export async function fetchArtistPhoto(artist: string): Promise<string | null> {
  const encoded = encodeURIComponent(artist)

  // Try Wikipedia REST API first
  try {
    const resp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`, {
      headers: { 'User-Agent': 'TaperKit/1.0 (live music library manager)' },
    })
    if (resp.ok) {
      const data = await resp.json() as { thumbnail?: { source?: string } }
      if (data?.thumbnail?.source) {
        const imgResp = await fetch(data.thumbnail.source, {
          headers: { 'User-Agent': 'TaperKit/1.0' },
        })
        if (imgResp.ok) {
          const buf = Buffer.from(await imgResp.arrayBuffer())
          const mime = imgResp.headers.get('content-type') || 'image/jpeg'
          return `data:${mime};base64,${buf.toString('base64')}`
        }
      }
    }
  } catch {
    // ignore
  }

  // Fallback: TheAudioDB
  try {
    const resp = await fetch(`https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encoded}`)
    if (resp.ok) {
      const data = await resp.json() as { artists?: Array<{ strArtistThumb?: string }> }
      const thumb = data?.artists?.[0]?.strArtistThumb
      if (thumb) {
        const imgResp = await fetch(thumb)
        if (imgResp.ok) {
          const buf = Buffer.from(await imgResp.arrayBuffer())
          const mime = imgResp.headers.get('content-type') || 'image/jpeg'
          return `data:${mime};base64,${buf.toString('base64')}`
        }
      }
    }
  } catch {
    // ignore
  }

  return null
}

export function generateShowPoster(opts: {
  artist: string
  date: string
  venue: string
  city: string
  state: string
}): string {
  const { artist, date, venue, city, state } = opts
  const W = 800
  const H = 800

  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  // — Background —
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, W, H)

  // — Film-grain noise texture —
  const imgData = ctx.getImageData(0, 0, W, H)
  const px = imgData.data
  for (let i = 0; i < px.length; i += 4) {
    const grain = (Math.random() - 0.5) * 22
    px[i] = Math.max(0, Math.min(255, px[i] + grain))
    px[i + 1] = Math.max(0, Math.min(255, px[i + 1] + grain))
    px[i + 2] = Math.max(0, Math.min(255, px[i + 2] + grain))
    px[i + 3] = 255
  }
  ctx.putImageData(imgData, 0, 0)

  // — Subtle grid —
  ctx.strokeStyle = 'rgba(255, 140, 66, 0.045)'
  ctx.lineWidth = 1
  for (let x = 0; x <= W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
  }
  for (let y = 0; y <= H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  // — Abstract waveform (dual, fills mid-section) —
  const drawWave = (baseY: number, alpha: number, lw: number, phase: number) => {
    ctx.beginPath()
    ctx.strokeStyle = `rgba(255, 140, 66, ${alpha})`
    ctx.lineWidth = lw
    ctx.moveTo(34, baseY)
    for (let x = 34; x < W - 34; x += 2) {
      const y = baseY
        + Math.sin((x + phase) * 0.022) * 20
        + Math.sin((x + phase) * 0.058 + 0.8) * 10
        + Math.sin((x + phase) * 0.009) * 28
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  drawWave(H * 0.62, 0.13, 2, 0)
  drawWave(H * 0.63, 0.06, 1, 180)

  // — Outer orange border —
  ctx.strokeStyle = '#ff8c42'
  ctx.lineWidth = 2.5
  ctx.strokeRect(16, 16, W - 32, H - 32)

  // — Inner subtle border —
  ctx.strokeStyle = 'rgba(255, 140, 66, 0.22)'
  ctx.lineWidth = 1
  ctx.strokeRect(24, 24, W - 48, H - 48)

  // — Corner accent brackets —
  const br = 28 // bracket reach
  const bm = 16 // border margin (same as outer border)
  ctx.strokeStyle = '#ff8c42'
  ctx.lineWidth = 2.5
  const corners: [number, number, number, number, number, number][] = [
    // top-left
    [bm, bm + br, bm, bm, bm + br, bm],
    // top-right
    [W - bm - br, bm, W - bm, bm, W - bm, bm + br],
    // bottom-left
    [bm, H - bm - br, bm, H - bm, bm + br, H - bm],
    // bottom-right
    [W - bm - br, H - bm, W - bm, H - bm, W - bm, H - bm - br],
  ]
  for (const [x1, y1, x2, y2, x3, y3] of corners) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.stroke()
  }

  // — Horizontal divider above venue block —
  const divY = H * 0.735
  ctx.beginPath()
  ctx.strokeStyle = 'rgba(255, 140, 66, 0.45)'
  ctx.lineWidth = 1
  ctx.moveTo(38, divY); ctx.lineTo(W - 38, divY)
  ctx.stroke()

  // Small orange dot accents on the divider
  ctx.fillStyle = '#ff8c42'
  ctx.beginPath(); ctx.arc(38, divY, 3, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(W - 38, divY, 3, 0, Math.PI * 2); ctx.fill()

  // — Artist name —
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const maxTextW = W - 100

  let fontSize = 82
  ctx.font = `bold ${fontSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`
  let lines = wrapText(ctx, artist.toUpperCase(), maxTextW)

  // Shrink until it fits in 3 lines max, or font stops at 28px
  while (lines.length > 3 && fontSize > 28) {
    fontSize -= 6
    ctx.font = `bold ${fontSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`
    lines = wrapText(ctx, artist.toUpperCase(), maxTextW)
  }

  const lineH = fontSize * 1.18
  const totalH = lines.length * lineH
  const artistCenterY = H * 0.30
  const artistStartY = artistCenterY - totalH / 2

  // Subtle text glow / shadow
  ctx.shadowColor = 'rgba(255, 140, 66, 0.25)'
  ctx.shadowBlur = 24
  ctx.fillStyle = '#ffffff'
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, artistStartY + lineH * i + lineH / 2)
  })
  ctx.shadowBlur = 0

  // — Date —
  ctx.fillStyle = '#ff8c42'
  ctx.font = `bold 32px "Helvetica Neue", Helvetica, Arial, sans-serif`
  ctx.shadowColor = 'rgba(255, 140, 66, 0.4)'
  ctx.shadowBlur = 10
  ctx.fillText(date || '', W / 2, H * 0.565)
  ctx.shadowBlur = 0

  // — Venue —
  if (venue) {
    ctx.fillStyle = '#b0b0b0'
    ctx.font = `600 22px "Helvetica Neue", Helvetica, Arial, sans-serif`
    ctx.fillText(venue, W / 2, H * 0.805)
  }

  // — City, State —
  const location = [city, state].filter(Boolean).join(', ')
  if (location) {
    ctx.fillStyle = '#727272'
    ctx.font = `18px "Helvetica Neue", Helvetica, Arial, sans-serif`
    ctx.fillText(location, W / 2, venue ? H * 0.865 : H * 0.82)
  }

  // — Faint "LIVE" watermark behind the waveform —
  ctx.save()
  ctx.globalAlpha = 0.025
  ctx.fillStyle = '#ff8c42'
  ctx.font = `bold 220px "Helvetica Neue", Helvetica, Arial, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.fillText('LIVE', W / 2, H * 0.58)
  ctx.restore()

  return canvas.toDataURL('image/jpeg', 0.92)
}

export function saveArtwork(imagePath: string, dataUrl: string): void {
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
  const dir = path.dirname(imagePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(imagePath, Buffer.from(base64, 'base64'))
}

// Search MusicBrainz + Cover Art Archive for album artwork
export async function searchAlbumArt(artist: string, album: string): Promise<string | null> {
  try {
    // 1. Search MusicBrainz for the release
    const query = encodeURIComponent(`artist:"${artist}" release:"${album}"`)
    const mbResp = await fetch(
      `https://musicbrainz.org/ws/2/release/?query=${query}&limit=5&fmt=json`,
      { headers: { 'User-Agent': 'TaperKit/1.0 (live-music-library-manager)' } }
    )
    if (!mbResp.ok) return null
    const mbData = await mbResp.json() as { releases?: Array<{ id: string; score: number }> }
    const releases = mbData.releases || []
    if (releases.length === 0) return null

    // Try each release until we find cover art
    for (const release of releases.slice(0, 3)) {
      try {
        const caaResp = await fetch(
          `https://coverartarchive.org/release/${release.id}/front`,
          { headers: { 'User-Agent': 'TaperKit/1.0' }, redirect: 'follow' }
        )
        if (!caaResp.ok) continue
        const buffer = await caaResp.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')
        const mime = caaResp.headers.get('content-type') || 'image/jpeg'
        return `data:${mime};base64,${base64}`
      } catch { continue }
    }
    return null
  } catch {
    return null
  }
}
