import React, { useState, useEffect, useRef } from 'react'
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

type SuggestionWithMb = LibraryShowSuggestion & { mbArtworkUrl?: string }

export default function SuggestionPanel({ show, onClose, onApprove, onSkip, destinationRoot }: Props) {
  const [suggestion, setSuggestion] = useState<SuggestionWithMb | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mbSearching, setMbSearching] = useState(false)
  const [mbError, setMbError] = useState<string | null>(null)
  const [existingArtworkUrl, setExistingArtworkUrl] = useState<string | null>(null)
  const autoSearchedRef = useRef<string | null>(null)

  // Load existing embedded artwork when suggestion loads
  useEffect(() => {
    if (!suggestion?.originalShow?.files?.[0]?.filePath) return
    const filePath = suggestion.originalShow.files[0].filePath
    fetch(`/api/artwork?file=${encodeURIComponent(filePath)}`)
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => setExistingArtworkUrl(URL.createObjectURL(blob)))
      .catch(() => setExistingArtworkUrl(null))
  }, [suggestion?.showId])

  // Auto MusicBrainz lookup for album-type releases
  useEffect(() => {
    if (
      suggestion &&
      suggestion.releaseType === 'album' &&
      autoSearchedRef.current !== suggestion.showId
    ) {
      autoSearchedRef.current = suggestion.showId
      searchMusicBrainz()
    }
  }, [suggestion?.releaseType, suggestion?.showId]) // eslint-disable-line react-hooks/exhaustive-deps

  const searchMusicBrainz = async () => {
    if (!suggestion) return
    setMbSearching(true)
    setMbError(null)
    try {
      const isAlbumSearch = suggestion.releaseType === 'album'
      const tagAlbum = suggestion.albumTitle || suggestion.venue || ''
      const query = isAlbumSearch
        ? encodeURIComponent(`artist:"${suggestion.artist}" release:"${tagAlbum}"`)
        : encodeURIComponent(`artist:"${suggestion.artist}" date:${suggestion.date?.slice(0, 4) || ''} release:"${suggestion.venue || ''}"`)
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

      const knownYear = suggestion.year || suggestion.date?.slice(0, 4) || ''
      const exactMatches = releases.filter(r => r.title.toLowerCase() === tagAlbum.toLowerCase())
      let best = releases[0]
      if (exactMatches.length > 0) {
        if (knownYear) {
          const yearMatch = exactMatches.find(r => r.date?.startsWith(knownYear))
          if (yearMatch) {
            best = yearMatch
          } else {
            const sorted = exactMatches
              .filter(r => r.date)
              .sort((a, b) =>
                Math.abs(parseInt(a.date!.slice(0, 4)) - parseInt(knownYear)) -
                Math.abs(parseInt(b.date!.slice(0, 4)) - parseInt(knownYear))
              )
            best = sorted[0] || exactMatches[0]
          }
        } else {
          best = exactMatches[0]
        }
      }

      const mbArtistRaw = best['artist-credit']?.[0]?.artist?.name || best['artist-credit']?.[0]?.name || ''
      const existingArtist = suggestion.artist.toLowerCase().replace(/[^a-z0-9]/g, '')
      const mbArtistNorm = mbArtistRaw.toLowerCase().replace(/[^a-z0-9]/g, '')
      const artistMatches =
        !existingArtist || !mbArtistNorm ||
        existingArtist.includes(mbArtistNorm) || mbArtistNorm.includes(existingArtist)
      const mbArtist = artistMatches ? (mbArtistRaw || suggestion.artist) : suggestion.artist
      const mbYear = knownYear || (best.date ? best.date.slice(0, 4) : suggestion.year)

      let artworkUrl = ''
      try {
        const itunesRes = await fetch(
          `/api/itunes-art?artist=${encodeURIComponent(mbArtist)}&album=${encodeURIComponent(best.title)}`
        )
        if (itunesRes.ok) {
          const itunesData = await itunesRes.json() as { artworkUrl?: string }
          if (itunesData.artworkUrl) artworkUrl = itunesData.artworkUrl
        }
      } catch { /* itunes failed, try CAA */ }

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
    } catch {
      setMbError('MusicBrainz lookup failed')
    } finally {
      setMbSearching(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    setError(null)
    autoSearchedRef.current = null
    fetch('/api/library/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show }),
    })
      .then(r => r.json())
      .then(data => { setSuggestion(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [show.id])

  // Keyboard shortcuts: 'a' = approve, 's' = skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return
      if (e.metaKey || e.ctrlKey) return
      if (e.key === 'a' || e.key === 'A') {
        if (suggestion) onApprove(suggestion)
      }
      if (e.key === 's' || e.key === 'S') {
        onSkip()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [suggestion, onApprove, onSkip])

  const update = (field: keyof LibraryShowSuggestion, value: string) => {
    if (!suggestion) return
    setSuggestion(prev => {
      if (!prev) return prev
      const updated = { ...prev, [field]: value }
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

  const firstFile = show.files[0]

  return (
    <>
      {/* Side panel */}
      <div
        style={{
          position: 'fixed',
          top: '52px',
          right: 0,
          width: '50%',
          height: 'calc(100vh - 52px)',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 50,
          animation: 'slideInRight 0.25s ease',
        }}
      >
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading suggestion...
          </div>
        ) : error || !suggestion ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--error)' }}>
            {error || 'Failed to load suggestion'}
          </div>
        ) : (
          <>
            {/* Header */}
            <div
              style={{
                padding: '12px 20px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>Review Show</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>
                  {show.folderPath.split('/').pop()}
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
                  padding: '16px 20px',
                  borderRight: '1px solid var(--border)',
                  background: 'var(--surface)',
                  overflowY: 'auto',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Current
                </div>

                {(existingArtworkUrl || suggestion.releaseType === 'album') && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={labelStyle}>Album Art</div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                      <div style={{
                        width: 72, height: 72, borderRadius: 5,
                        background: 'var(--border)', overflow: 'hidden', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, border: '1px solid var(--border)',
                      }}>
                        {existingArtworkUrl
                          ? <img src={existingArtworkUrl} alt="artwork" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ color: 'var(--text-muted)' }}>💿</span>
                        }
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{show.albumTitle || show.artist}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{show.artist}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{show.year || show.date?.slice(0, 4)}</div>
                        <div style={{ fontSize: 10, color: existingArtworkUrl ? 'var(--accent)' : 'var(--text-muted)', marginTop: 3 }}>
                          {existingArtworkUrl ? '✓ Artwork embedded' : '⚠ No artwork'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: '10px' }}>
                  <div style={labelStyle}>Folder</div>
                  <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                    {show.folderPath.split('/').pop()}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                  <div>
                    <div style={labelStyle}>Artist</div>
                    <div style={{ fontSize: '12px' }}>{show.artist || <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
                  </div>
                  <div>
                    <div style={labelStyle}>Date</div>
                    <div style={{ fontSize: '12px' }}>{show.date || <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
                  </div>
                  <div>
                    <div style={labelStyle}>Venue</div>
                    <div style={{ fontSize: '12px' }}>{show.venue || <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
                  </div>
                  <div>
                    <div style={labelStyle}>City / State</div>
                    <div style={{ fontSize: '12px' }}>
                      {[show.city, show.state].filter(Boolean).join(', ') || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </div>
                  </div>
                </div>

                {firstFile?.existingTags && Object.keys(firstFile.existingTags).length > 0 && (
                  <div style={{ marginBottom: '10px' }}>
                    <div style={labelStyle}>Existing Tags</div>
                    {Object.entries(firstFile.existingTags).map(([k, v]) => (
                      <div key={k} style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span style={{ color: 'var(--accent)', marginRight: '4px' }}>{k}:</span>{v}
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <div style={labelStyle}>Files ({show.fileCount})</div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {show.files.map((f, i) => (
                      <div key={i} style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)', padding: '1px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {f.filename}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Proposed state (editable) */}
              <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Proposed
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <div style={labelStyle}>Folder Name</div>
                  <input
                    style={fieldStyle}
                    value={suggestion.proposedFolderName}
                    onChange={e => setSuggestion(prev => prev ? { ...prev, proposedFolderName: e.target.value } : prev)}
                  />
                </div>

                {/* Release type toggle */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                  {(['live', 'album'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setSuggestion(prev => {
                        if (!prev) return prev
                        const isAlbum = t === 'album'
                        const rebuiltFiles = prev.proposedFiles.map((f, i) => {
                          const trackNum = String(i + 1).padStart(2, '0')
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
                        const proposedFolderName = isAlbum
                          ? [prev.albumTitle, prev.year ? `(${prev.year})` : ''].filter(Boolean).join(' ')
                          : [prev.date, prev.venue, [prev.city, prev.state].filter(Boolean).join(', ')].filter(Boolean).join(' ')
                        return { ...prev, releaseType: t, proposedFiles: rebuiltFiles, proposedFolderName }
                      })}
                      style={{
                        padding: '4px 12px',
                        background: suggestion.releaseType === t ? 'var(--accent)' : 'var(--surface)',
                        color: suggestion.releaseType === t ? '#1a1a1a' : 'var(--text-muted)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        fontWeight: suggestion.releaseType === t ? 600 : 400,
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                      }}
                    >
                      {t === 'live' ? '🎤 Live' : '💿 Album'}
                    </button>
                  ))}
                </div>

                {suggestion.releaseType === 'live' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                    <div><div style={labelStyle}>Artist</div><input style={fieldStyle} value={suggestion.artist} onChange={e => update('artist', e.target.value)} /></div>
                    <div><div style={labelStyle}>Date</div><input style={fieldStyle} value={suggestion.date} onChange={e => update('date', e.target.value)} /></div>
                    <div><div style={labelStyle}>Venue</div><input style={fieldStyle} value={suggestion.venue} onChange={e => update('venue', e.target.value)} /></div>
                    <div><div style={labelStyle}>City</div><input style={fieldStyle} value={suggestion.city} onChange={e => update('city', e.target.value)} /></div>
                    <div><div style={labelStyle}>State</div><input style={fieldStyle} value={suggestion.state} onChange={e => update('state', e.target.value)} /></div>
                    <div>
                      <div style={labelStyle}>Source</div>
                      <select style={fieldStyle} value={suggestion.source} onChange={e => update('source', e.target.value)}>
                        <option value="">—</option>
                        <option value="SBD">SBD</option>
                        <option value="AUD">AUD</option>
                        <option value="Matrix">Matrix</option>
                        <option value="FM">FM</option>
                        <option value="Video">Video</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '6px', marginBottom: '8px' }}>
                      <div><div style={labelStyle}>Artist</div><input style={fieldStyle} value={suggestion.artist} onChange={e => update('artist', e.target.value)} /></div>
                      <div><div style={labelStyle}>Album Title</div><input style={fieldStyle} value={suggestion.albumTitle} onChange={e => setSuggestion(prev => prev ? { ...prev, albumTitle: e.target.value } : prev)} /></div>
                      <div><div style={labelStyle}>Year</div><input style={fieldStyle} value={suggestion.year} onChange={e => setSuggestion(prev => prev ? { ...prev, year: e.target.value } : prev)} /></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        onClick={searchMusicBrainz}
                        disabled={mbSearching || !suggestion.artist}
                        style={{ padding: '5px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', fontSize: '11px', cursor: 'pointer', opacity: mbSearching ? 0.6 : 1, whiteSpace: 'nowrap' }}
                      >
                        {mbSearching ? '🔍 Searching…' : '🎵 Lookup MusicBrainz'}
                      </button>
                      {suggestion.mbArtworkUrl && (
                        <img
                          src={suggestion.mbArtworkUrl}
                          alt="Album art"
                          style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover', border: '1px solid var(--border)' }}
                        />
                      )}
                      {mbError && <span style={{ fontSize: '11px', color: 'var(--error)' }}>{mbError}</span>}
                    </div>
                  </div>
                )}

                {/* File renames with diff highlighting */}
                <div>
                  <div style={labelStyle}>File Renames</div>
                  <div style={{ overflowY: 'auto', maxHeight: '240px' }}>
                    {suggestion.proposedFiles.map((f, i) => (
                      <div key={i} style={{ marginBottom: '6px' }}>
                        {/* Original filename (muted) */}
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: '2px', opacity: 0.7 }}>
                          <FileDiff original={f.originalFilename} proposed={f.proposedFilename} />
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
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
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
                padding: '12px 20px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                gap: '10px',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0,
                background: 'var(--surface)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '12px' }}>
                <span style={{ opacity: 0.7 }}><kbd style={kbdStyle}>A</kbd> approve</span>
                <span style={{ opacity: 0.7 }}><kbd style={kbdStyle}>S</kbd> skip</span>
                <span style={{ opacity: 0.7 }}><kbd style={kbdStyle}>← →</kbd> navigate</span>
                <span style={{ opacity: 0.7 }}><kbd style={kbdStyle}>Esc</kbd> close</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-secondary" style={{ padding: '6px 16px', fontSize: '13px' }} onClick={onSkip}>Skip</button>
                <button className="btn-primary" style={{ padding: '6px 16px', fontSize: '13px' }} onClick={() => onApprove(suggestion)}>
                  Approve
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @media (max-width: 1024px) {
          .suggestion-panel-override {
            width: 100% !important;
            left: 0 !important;
          }
        }
      `}</style>
    </>
  )
}

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  background: 'var(--border)',
  borderRadius: '3px',
  padding: '1px 5px',
  fontSize: '10px',
  fontFamily: 'monospace',
  color: 'var(--text)',
}

// Simple diff: show unchanged prefix/suffix in muted, changed middle highlighted
function FileDiff({ original, proposed }: { original: string; proposed: string }) {
  if (original === proposed) {
    return <span style={{ color: 'var(--text-muted)' }}>{original}</span>
  }

  // Find common prefix
  let prefixLen = 0
  const minLen = Math.min(original.length, proposed.length)
  while (prefixLen < minLen && original[prefixLen] === proposed[prefixLen]) prefixLen++

  // Find common suffix (only after prefix)
  let suffixLen = 0
  while (
    suffixLen < minLen - prefixLen &&
    original[original.length - 1 - suffixLen] === proposed[proposed.length - 1 - suffixLen]
  ) suffixLen++

  const prefix = original.slice(0, prefixLen)
  const removed = original.slice(prefixLen, original.length - suffixLen)
  const suffix = original.slice(original.length - suffixLen || original.length)

  return (
    <span>
      {prefix && <span style={{ color: 'var(--text-muted)' }}>{prefix}</span>}
      {removed && (
        <span style={{ color: 'var(--error)', textDecoration: 'line-through', opacity: 0.7 }}>{removed}</span>
      )}
      {suffix && <span style={{ color: 'var(--text-muted)' }}>{suffix}</span>}
    </span>
  )
}
