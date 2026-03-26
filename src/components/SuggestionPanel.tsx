import React, { useState, useEffect } from 'react'
import { LibraryShow, LibraryShowSuggestion } from '../types'
import ArtworkPicker from './ArtworkPicker'

interface Props {
  show: LibraryShow
  onClose: () => void
  onApprove: (suggestion: LibraryShowSuggestion) => void
  onSkip: () => void
  destinationRoot?: string
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '6px 8px',
  color: 'var(--text)',
  fontSize: '13px',
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '4px',
}

export default function SuggestionPanel({ show, onClose, onApprove, onSkip, destinationRoot }: Props) {
  const [suggestion, setSuggestion] = useState<LibraryShowSuggestion | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mbSearching, setMbSearching] = useState(false)
  const [mbError, setMbError] = useState<string | null>(null)
  const [existingArtworkUrl, setExistingArtworkUrl] = useState<string | null>(null)

  // Try to load existing embedded artwork when suggestion loads
  useEffect(() => {
    if (!suggestion?.originalShow?.files?.[0]?.filePath) return
    const filePath = suggestion.originalShow.files[0].filePath
    // Check if artwork exists
    fetch(`/api/artwork?file=${encodeURIComponent(filePath)}`)
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => setExistingArtworkUrl(URL.createObjectURL(blob)))
      .catch(() => setExistingArtworkUrl(null))
  }, [suggestion?.showId])

  const searchMusicBrainz = async () => {
    if (!suggestion) return
    setMbSearching(true)
    setMbError(null)
    try {
      // Build query based on release type
      const isAlbumSearch = suggestion.releaseType === 'album'
      // For albums: search by artist + album title. For live: search by artist + venue/date.
      const tagAlbum = suggestion.albumTitle || suggestion.venue || ''
      const query = isAlbumSearch
        ? encodeURIComponent(`artist:"${suggestion.artist}" release:"${tagAlbum}"`)
        : encodeURIComponent(`artist:"${suggestion.artist}" date:${suggestion.date?.slice(0,4) || ''} release:"${suggestion.venue || ''}"`)
      const res = await fetch(`https://musicbrainz.org/ws/2/release/?query=${query}&limit=5&fmt=json`, {
        headers: { 'User-Agent': 'TaperKit/1.0 (taperkit@local)' }
      })
      const data = await res.json()
      const releases = data.releases as Array<{
        title: string
        date?: string
        'artist-credit'?: Array<{ name?: string; artist?: { name: string } }>
        id: string
        'cover-art-archive'?: { front: boolean }
      }>
      if (!releases?.length) { setMbError('No results found'); setMbSearching(false); return }

      // Pick best match:
      // 1. Exact title match whose year matches our known year (original release, not a remaster)
      // 2. Exact title match closest to our known year
      // 3. Any exact title match
      // 4. First result
      const knownYear = suggestion.year || suggestion.date?.slice(0, 4) || ''
      const exactMatches = releases.filter(r => r.title.toLowerCase() === tagAlbum.toLowerCase())
      let best = releases[0]
      if (exactMatches.length > 0) {
        if (knownYear) {
          // Prefer release whose year matches known year exactly
          const yearMatch = exactMatches.find(r => r.date?.startsWith(knownYear))
          if (yearMatch) {
            best = yearMatch
          } else {
            // Pick closest year to known year
            const sorted = exactMatches
              .filter(r => r.date)
              .sort((a, b) => Math.abs(parseInt(a.date!.slice(0,4)) - parseInt(knownYear)) - Math.abs(parseInt(b.date!.slice(0,4)) - parseInt(knownYear)))
            best = sorted[0] || exactMatches[0]
          }
        } else {
          best = exactMatches[0]
        }
      }

      const mbArtist = best['artist-credit']?.[0]?.artist?.name || best['artist-credit']?.[0]?.name || suggestion.artist
      // Keep existing year if we have one — MusicBrainz may return a remaster/reissue date
      const mbYear = knownYear || (best.date ? best.date.slice(0, 4) : suggestion.year)

      // Try iTunes via local proxy (avoids CORS)
      let artworkUrl = ''
      try {
        const itunesRes = await fetch(`/api/itunes-art?artist=${encodeURIComponent(mbArtist)}&album=${encodeURIComponent(best.title)}`)
        if (itunesRes.ok) {
          const itunesData = await itunesRes.json() as { artworkUrl?: string }
          if (itunesData.artworkUrl) artworkUrl = itunesData.artworkUrl
        }
      } catch { /* itunes failed, try CAA */ }

      // Fallback to Cover Art Archive
      if (!artworkUrl && best['cover-art-archive']?.front) {
        artworkUrl = `https://coverartarchive.org/release/${best.id}/front-500`
      }

      setSuggestion(prev => prev ? {
        ...prev,
        artist: mbArtist,
        albumTitle: best.title,
        year: mbYear,
        proposedFolderName: [best.title, mbYear ? `(${mbYear})` : ''].filter(Boolean).join(' '),
        ...(artworkUrl ? { mbArtworkUrl: artworkUrl } : {}),
      } : prev)
      if (!artworkUrl) setMbError('Found release but no cover art available')
    } catch (e) {
      setMbError('MusicBrainz lookup failed')
    } finally {
      setMbSearching(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch('/api/library/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show }),
    })
      .then(r => r.json())
      .then(data => { setSuggestion(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [show.id])

  const update = (field: keyof LibraryShowSuggestion, value: string) => {
    if (!suggestion) return
    setSuggestion(prev => {
      if (!prev) return prev
      const updated = { ...prev, [field]: value }
      // Rebuild proposed folder name when key fields change
      if (['date', 'venue', 'city', 'state', 'albumTitle', 'year'].includes(field)) {
        if (updated.releaseType === 'album') {
          const title = field === 'albumTitle' ? value : updated.albumTitle
          const yr = field === 'year' ? value : updated.year
          updated.proposedFolderName = [title, yr ? `(${yr})` : ''].filter(Boolean).join(' ')
        } else {
          const d = field === 'date' ? value : updated.date
          const v = field === 'venue' ? value : updated.venue
          const c = field === 'city' ? value : updated.city
          const s = field === 'state' ? value : updated.state
          const locationParts = [v, [c, s].filter(Boolean).join(', ')].filter(Boolean)
          updated.proposedFolderName = [d, ...locationParts].filter(Boolean).join(' ')
        }
      }
      return updated
    })
  }

  const updateFileProposal = (idx: number, proposedFilename: string) => {
    if (!suggestion) return
    setSuggestion(prev => {
      if (!prev) return prev
      const files = [...prev.proposedFiles]
      files[idx] = { ...files[idx], proposedFilename }
      return { ...prev, proposedFiles: files }
    })
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading suggestion...
      </div>
    )
  }

  if (error || !suggestion) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--error)' }}>
        {error || 'Failed to load suggestion'}
      </div>
    )
  }

  const firstFile = show.files[0]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          width: '90vw',
          maxWidth: '1200px',
          height: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          resize: 'both',
          minWidth: '700px',
          minHeight: '500px',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px' }}>Review Show</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {show.folderPath}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '20px',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px 8px',
            }}
          >
            ×
          </button>
        </div>

        {/* Body: two columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, flex: 1, overflow: 'hidden' }}>
          {/* Left: Current state */}
          <div
            style={{
              padding: '20px 24px',
              borderRight: '1px solid var(--border)',
              background: 'var(--surface)',
              overflowY: 'auto',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Current
            </div>

            {/* Jellyfin-style album card preview */}
            {(existingArtworkUrl || suggestion.releaseType === 'album') && (
              <div style={{ marginBottom: '16px' }}>
                <div style={labelStyle}>Album Art Preview</div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                  <div style={{
                    width: 96, height: 96, borderRadius: 6,
                    background: 'var(--border)',
                    overflow: 'hidden', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 32,
                    border: '1px solid var(--border)',
                  }}>
                    {existingArtworkUrl
                      ? <img src={existingArtworkUrl} alt="artwork" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ color: 'var(--text-muted)' }}>💿</span>
                    }
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{show.albumTitle || show.artist}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{show.artist}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{show.year || (show.date?.slice(0,4))}</div>
                    <div style={{ fontSize: 11, color: existingArtworkUrl ? 'var(--accent)' : 'var(--text-muted)', marginTop: 4 }}>
                      {existingArtworkUrl ? '✓ Artwork embedded' : '⚠ No artwork found'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: '12px' }}>
              <div style={labelStyle}>Folder</div>
              <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                {show.folderPath.split('/').pop()}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <div>
                <div style={labelStyle}>Artist</div>
                <div style={{ fontSize: '13px' }}>{show.artist || <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
              </div>
              <div>
                <div style={labelStyle}>Date</div>
                <div style={{ fontSize: '13px' }}>{show.date || <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
              </div>
              <div>
                <div style={labelStyle}>Venue</div>
                <div style={{ fontSize: '13px' }}>{show.venue || <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
              </div>
              <div>
                <div style={labelStyle}>City / State</div>
                <div style={{ fontSize: '13px' }}>
                  {[show.city, show.state].filter(Boolean).join(', ') || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </div>
              </div>
            </div>

            {firstFile?.existingTags && Object.keys(firstFile.existingTags).length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={labelStyle}>Existing Tags (first file)</div>
                {Object.entries(firstFile.existingTags).map(([k, v]) => (
                  <div key={k} style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--accent)', marginRight: '4px' }}>{k}:</span>{v}
                  </div>
                ))}
              </div>
            )}

            <div>
              <div style={labelStyle}>Files ({show.fileCount})</div>
              <div style={{ maxHeight: "100%", overflowY: "auto" }}>
                {show.files.map((f, i) => (
                  <div key={i} style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-muted)', padding: '1px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.filename}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Proposed state (editable) */}
          <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Proposed
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={labelStyle}>Folder Name</div>
              <input
                style={fieldStyle}
                value={suggestion.proposedFolderName}
                onChange={e => setSuggestion(prev => prev ? { ...prev, proposedFolderName: e.target.value } : prev)}
              />
            </div>

            {/* Release type toggle */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              {(['live', 'album'] as const).map(t => (
                <button key={t} onClick={() => setSuggestion(prev => {
                  if (!prev) return prev
                  const isAlbum = t === 'album'
                  const rebuiltFiles = prev.proposedFiles.map((f, i) => {
                    const trackNum = String(i + 1).padStart(2, '0')
                    // strip any existing prefix and keep just the clean title + ext
                    const ext = f.proposedFilename.match(/\.[a-z0-9]+$/i)?.[0] ?? ''
                    const title = f.proposedFilename
                      .replace(/\.[a-z0-9]+$/i, '')
                      .replace(/^d\d+-\d+\s*/i, '')
                      .replace(/^\d{2}\s+/, '')
                      .trim()
                    const proposedFilename = isAlbum
                      ? `${trackNum} ${title}${ext}`
                      : `d1-${trackNum} ${title}${ext}`
                    return { ...f, proposedFilename }
                  })
                  // Rebuild folder name for release type
                  const proposedFolderName = isAlbum
                    ? [prev.albumTitle, prev.year ? `(${prev.year})` : ''].filter(Boolean).join(' ')
                    : [prev.date, prev.venue, [prev.city, prev.state].filter(Boolean).join(', ')].filter(Boolean).join(' ')
                  return { ...prev, releaseType: t, proposedFiles: rebuiltFiles, proposedFolderName }
                })}
                  style={{ padding: '4px 12px', background: suggestion.releaseType === t ? 'var(--accent)' : 'var(--surface)', color: suggestion.releaseType === t ? '#1a1a1a' : 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '4px', fontWeight: suggestion.releaseType === t ? 600 : 400, fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}>
                  {t === 'live' ? '🎤 Live' : '💿 Album'}
                </button>
              ))}
            </div>

            {suggestion.releaseType === 'live' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div><div style={labelStyle}>Artist</div><input style={fieldStyle} value={suggestion.artist} onChange={e => update('artist', e.target.value)} /></div>
                <div><div style={labelStyle}>Date (YYYY-MM-DD)</div><input style={fieldStyle} value={suggestion.date} onChange={e => update('date', e.target.value)} /></div>
                <div><div style={labelStyle}>Venue</div><input style={fieldStyle} value={suggestion.venue} onChange={e => update('venue', e.target.value)} /></div>
                <div><div style={labelStyle}>City</div><input style={fieldStyle} value={suggestion.city} onChange={e => update('city', e.target.value)} /></div>
                <div><div style={labelStyle}>State</div><input style={fieldStyle} value={suggestion.state} onChange={e => update('state', e.target.value)} /></div>
                <div>
                  <div style={labelStyle}>Source Type</div>
                  <select style={fieldStyle} value={suggestion.source} onChange={e => update('source', e.target.value)}>
                    <option value="">—</option><option value="SBD">SBD</option><option value="AUD">AUD</option>
                    <option value="Matrix">Matrix</option><option value="FM">FM</option><option value="Video">Video</option>
                  </select>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: '8px', marginBottom: '8px' }}>
                  <div><div style={labelStyle}>Artist</div><input style={fieldStyle} value={suggestion.artist} onChange={e => update('artist', e.target.value)} /></div>
                  <div><div style={labelStyle}>Album Title</div><input style={fieldStyle} value={suggestion.albumTitle} onChange={e => setSuggestion(prev => prev ? { ...prev, albumTitle: e.target.value } : prev)} /></div>
                  <div><div style={labelStyle}>Year</div><input style={fieldStyle} value={suggestion.year} onChange={e => setSuggestion(prev => prev ? { ...prev, year: e.target.value } : prev)} /></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    onClick={searchMusicBrainz}
                    disabled={mbSearching || !suggestion.artist}
                    style={{ padding: '5px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', fontSize: '11px', cursor: 'pointer', opacity: mbSearching ? 0.6 : 1, whiteSpace: 'nowrap' }}
                  >
                    {mbSearching ? '🔍 Searching…' : '🎵 Lookup MusicBrainz'}
                  </button>
                  {(suggestion as LibraryShowSuggestion & { mbArtworkUrl?: string }).mbArtworkUrl && (
                    <img
                      src={(suggestion as LibraryShowSuggestion & { mbArtworkUrl?: string }).mbArtworkUrl}
                      alt="Album art"
                      style={{ width: 48, height: 48, borderRadius: 4, objectFit: 'cover', border: '1px solid var(--border)' }}
                    />
                  )}
                  {mbError && <span style={{ fontSize: '11px', color: 'var(--error)' }}>{mbError}</span>}
                </div>
              </div>
            )}

            <div>
              <div style={labelStyle}>File Renames</div>
              <div style={{ maxHeight: "100%", overflowY: "auto" }}>
                {suggestion.proposedFiles.map((f, i) => (
                  <div key={i} style={{ marginBottom: '4px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: '2px' }}>
                      {f.originalFilename}
                    </div>
                    <input
                      style={{ ...fieldStyle, fontSize: '11px', fontFamily: 'monospace' }}
                      value={f.proposedFilename}
                      onChange={e => updateFileProposal(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Artwork */}
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
              <ArtworkPicker
                artist={suggestion.artist}
                date={suggestion.date}
                venue={suggestion.venue}
                city={suggestion.city}
                state={suggestion.state}
                destDir={
                  destinationRoot && suggestion.artist && suggestion.proposedFolderName
                    ? `${destinationRoot}/${suggestion.artist}/${suggestion.proposedFolderName}`
                    : undefined
                }
                artistDir={
                  destinationRoot && suggestion.artist
                    ? `${destinationRoot}/${suggestion.artist}`
                    : undefined
                }
              />
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
          }}
        >
          <button className="btn-secondary" onClick={onSkip}>Skip</button>
          <button className="btn-primary" onClick={() => onApprove(suggestion)}>
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}
