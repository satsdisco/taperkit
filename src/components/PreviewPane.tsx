import React from 'react'
import { ShowInfo, PreviewEntry } from '../types'

interface PreviewPaneProps {
  show: ShowInfo
  outputDir: string
}

// Client-side path preview (mirrors server renamer logic)
function sanitize(str: string): string {
  return str.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()
}

function buildPreviewTree(show: ShowInfo, outputDir: string): PreviewEntry[] {
  const albumParts = [show.date, show.venue, show.city && show.state ? `${show.city}, ${show.state}` : show.city]
    .filter(Boolean)
  const albumName = sanitize(albumParts.join(' '))
  const artist = sanitize(show.artist || 'Unknown Artist')

  return show.tracks.map(track => {
    const ext = track.filename.slice(track.filename.lastIndexOf('.'))
    const discPart = `d${track.disc}`
    const trackPart = String(track.track).padStart(2, '0')
    const titlePart = track.title ? ` ${sanitize(track.title)}` : ''
    const filename = `${discPart}-${trackPart}${titlePart}${ext}`

    return {
      sourceFilePath: track.filePath,
      targetFilePath: [outputDir, artist, albumName, filename].join('/'),
    }
  })
}

export default function PreviewPane({ show, outputDir }: PreviewPaneProps) {
  const entries = buildPreviewTree(show, outputDir)

  // Group by album folder
  const albumFolders = new Map<string, PreviewEntry[]>()
  for (const entry of entries) {
    const parts = entry.targetFilePath.split('/')
    const folder = parts.slice(0, -1).join('/')
    if (!albumFolders.has(folder)) albumFolders.set(folder, [])
    albumFolders.get(folder)!.push(entry)
  }

  // Build tree display
  const artistFolders = new Map<string, Map<string, string[]>>()
  for (const entry of entries) {
    const parts = entry.targetFilePath.split('/')
    const filename = parts[parts.length - 1]
    const albumFolder = parts.slice(0, -1).join('/')
    const albumName = parts[parts.length - 2]
    const artistName = parts[parts.length - 3]

    if (!artistFolders.has(artistName)) artistFolders.set(artistName, new Map())
    const albums = artistFolders.get(artistName)!
    if (!albums.has(albumName)) albums.set(albumName, [])
    albums.get(albumName)!.push(filename)
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '16px',
        fontFamily: 'monospace',
        fontSize: '13px',
        lineHeight: '1.6',
        overflow: 'auto',
        maxHeight: '400px',
      }}
    >
      {entries.length === 0 ? (
        <span style={{ color: 'var(--text-muted)' }}>Nothing to preview yet.</span>
      ) : (
        Array.from(artistFolders.entries()).map(([artist, albums]) => (
          <div key={artist}>
            <div style={{ color: 'var(--accent)', fontWeight: 600 }}>{artist}/</div>
            {Array.from(albums.entries()).map(([album, files]) => (
              <div key={album} style={{ marginLeft: '16px' }}>
                <div style={{ color: 'var(--text)' }}>{album}/</div>
                {files.map(file => (
                  <div key={file} style={{ marginLeft: '32px', color: 'var(--text-muted)' }}>
                    {file}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
