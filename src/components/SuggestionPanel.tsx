import React, { useState, useEffect, useRef } from 'react'
import { LibraryShow, LibraryShowSuggestion } from '../types'
import ArtworkPicker from './ArtworkPicker'

const PANEL_MIN = 380
const PANEL_MAX = 700
const PANEL_DEFAULT = 480

interface Props {
  show: LibraryShow
  onClose: () => void
  onApprove: (suggestion: LibraryShowSuggestion) => void
  onSkip: () => void
  destinationRoot?: string
  onWidthChange?: (width: number) => void
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '7px 10px',
  color: 'var(--text)',
  fontSize: '13px',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '5px',
}

const sectionStyle: React.CSSProperties = {
  paddingTop: '16px',
  paddingBottom: '16px',
  borderBottom: '1px solid var(--border)',
}

type SuggestionWithMb = LibraryShowSuggestion & { mbArtworkUrl?: string }

export default function SuggestionPanel({ show, onClose, onApprove, onSkip, destinationRoot, onWidthChange }: Props) {
  const [suggestion, setSuggestion] = useState<SuggestionWithMb | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mbSearching, setMbSearching] = useState(false)
  const [mbError, setMbError] = useState<string | null>(null)
  const [existingArtworkUrl, setExistingArtworkUrl] = useState<string | null>(null)
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT)
  const autoSearchedRef = useRef<string | null>(null)
  const isDraggingRef = useRef(false)
  const dragStartXRef = useRef(0)
  const dragStartWidthRef = useRef(0)

  // Resize drag handle
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    dragStartXRef.current = e.clientX
    dragStartWidthRef.current = panelWidth

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return
      const delta = dragStartXRef.current - ev.clientX
      const newWidth = Math.min(PANEL_MAX, Math.max(PANEL_MIN, dragStartWidthRef.current + delta))
      setPanelWidth(newWidth)
      onWidthChange?.(newWidth)
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

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

      // Guard: only accept MB title if it reasonably matches the existing albumTitle.
      // If existing albumTitle is set and MB returns something completely different, keep ours.
      const existingAlbumTitle = suggestion.albumTitle || ''
      const mbTitleLower = best.title.toLowerCase()
      const existingWords = existingAlbumTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2)
      const mbTitleMatchesExisting =
        !existingAlbumTitle ||
        existingWords.some(w => mbTitleLower.includes(w))
      const acceptedAlbumTitle = mbTitleMatchesExisting ? best.title : existingAlbumTitle
      const acceptedFolderName = [acceptedAlbumTitle, mbYear ? `(${mbYear})` : ''].filter(Boolean).join(' ')

      setSuggestion(prev => prev ? {
        ...prev,
        artist: mbArtist,
        albumTitle: acceptedAlbumTitle,
        year: mbYear,
        proposedFolderName: acceptedFolderName,
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

  // Jellyfin output path preview
  const jellyfinPath = suggestion
    ? [
        destinationRoot,
        suggestion.artist,
        suggestion.proposedFolderName,
      ].filter(Boolean).join('/')
    : null

  return (
    <>
      {/* Side panel */}
      <div
        style={{
          position: 'fixed',
          top: '56px',
          right: 0,
          width: `${panelWidth}px`,
          height: 'calc(100vh - 56px)',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 50,
          animation: 'slideInRight 0.25s ease',
        }}
      >
        {/* Drag handle on left edge */}
        <div
          onMouseDown={handleDragStart}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '5px',
            height: '100%',
            cursor: 'col-resize',
            zIndex: 10,
            background: 'transparent',
          }}
          title="Drag to resize"
        />

        {loading ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              color: 'var(--text-muted)',
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                border: '2px solid var(--border)',
                borderTopColor: 'var(--accent)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span style={{ fontSize: '13px' }}>Loading suggestion...</span>
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
                padding: '14px 20px',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)', marginBottom: '2px' }}>
                    {suggestion.artist || 'Unknown Artist'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {suggestion.date}
                    {suggestion.venue ? ` · ${suggestion.venue}` : ''}
                    {suggestion.city ? `, ${suggestion.city}` : ''}
                    {suggestion.state ? `, ${suggestion.state}` : ''}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    fontSize: '16px',
                    cursor: 'pointer',
                    lineHeight: 1,
                    padding: '4px 9px',
                    borderRadius: '6px',
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Body: single scrollable column */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>

              {/* === CURRENT === */}
              <div style={sectionStyle}>
                <div style={{ ...labelStyle, marginBottom: '10px' }}>Current</div>

                {/* Album art (if album or has embedded art) */}
                {(existingArtworkUrl || suggestion.releaseType === 'album') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: 8,
                      background: 'var(--bg)', overflow: 'hidden', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20, border: '1px solid var(--border)',
                    }}>
                      {existingArtworkUrl
                        ? <img src={existingArtworkUrl} alt="artwork" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ color: 'var(--text-muted)' }}>💿</span>
                      }
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{show.albumTitle || show.artist}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{show.artist}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{show.year || show.date?.slice(0, 4)}</div>
                      <div style={{ fontSize: 10, color: existingArtworkUrl ? 'var(--success)' : 'var(--text-muted)', marginTop: 2 }}>
                        {existingArtworkUrl ? '✓ Artwork embedded' : '⚠ No artwork'}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: '8px' }}>
                  <div style={labelStyle}>Folder</div>
                  <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                    {show.folderPath.split('/').pop()}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: existingArtworkUrl || firstFile?.existingTags ? '8px' : 0 }}>
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
                  <div style={{ marginTop: '8px' }}>
                    <div style={labelStyle}>Existing Tags</div>
                    {Object.entries(firstFile.existingTags).map(([k, v]) => (
                      <div key={k} style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span style={{ color: 'var(--accent)', marginRight: '4px' }}>{k}:</span>{v}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* === PROPOSED === */}
              <div style={sectionStyle}>
                <div style={{ ...labelStyle, color: 'var(--accent)', marginBottom: '10px' }}>Proposed</div>

                <div style={{ marginBottom: '10px' }}>
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
                        padding: '5px 14px',
                        background: suggestion.releaseType === t ? 'var(--accent)' : 'var(--surface-2)',
                        color: suggestion.releaseType === t ? '#fff' : 'var(--text-muted)',
                        border: suggestion.releaseType === t ? '1px solid var(--accent)' : '1px solid var(--border)',
                        borderRadius: '20px',
                        fontWeight: suggestion.releaseType === t ? 600 : 400,
                        fontSize: '11px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {t === 'live' ? '🎤 Live' : '💿 Album'}
                    </button>
                  ))}
                </div>

                {suggestion.releaseType === 'live' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
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
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginBottom: '10px' }}>
                      <div style={{ gridColumn: '1 / -1' }}><div style={labelStyle}>Artist</div><input style={fieldStyle} value={suggestion.artist} onChange={e => update('artist', e.target.value)} /></div>
                      <div><div style={labelStyle}>Album Title</div><input style={fieldStyle} value={suggestion.albumTitle} onChange={e => setSuggestion(prev => prev ? { ...prev, albumTitle: e.target.value } : prev)} /></div>
                      <div><div style={labelStyle}>Year</div><input style={fieldStyle} value={suggestion.year} onChange={e => setSuggestion(prev => prev ? { ...prev, year: e.target.value } : prev)} /></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        onClick={searchMusicBrainz}
                        disabled={mbSearching || !suggestion.artist}
                        style={{ padding: '5px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '11px', cursor: 'pointer', opacity: mbSearching ? 0.6 : 1, whiteSpace: 'nowrap' }}
                      >
                        {mbSearching ? '🔍 Searching…' : '🎵 Lookup MusicBrainz'}
                      </button>
                      {suggestion.mbArtworkUrl && (
                        <img
                          src={suggestion.mbArtworkUrl}
                          alt="Album art"
                          style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)' }}
                        />
                      )}
                      {mbError && <span style={{ fontSize: '11px', color: 'var(--error)' }}>{mbError}</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* === FILE RENAMES === */}
              <div style={sectionStyle}>
                <div style={{ ...labelStyle, marginBottom: '10px' }}>File Renames ({suggestion.proposedFiles.length})</div>
                {suggestion.proposedFiles.map((f, i) => (
                  <div key={i} style={{ marginBottom: '10px' }}>
                    {/* Original filename — strikethrough */}
                    <div style={{
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      color: 'var(--text-muted)',
                      textDecoration: 'line-through',
                      opacity: 0.6,
                      wordBreak: 'break-all',
                      lineHeight: 1.4,
                      marginBottom: '3px',
                    }}>
                      {f.originalFilename}
                    </div>
                    {/* Arrow */}
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px', paddingLeft: '2px' }}>↓</div>
                    {/* Proposed filename — editable */}
                    <input
                      style={{
                        ...fieldStyle,
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        color: 'var(--accent)',
                      }}
                      value={f.proposedFilename}
                      onChange={e => updateFileProposal(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>

              {/* === ARTWORK === */}
              <div style={{ paddingTop: '16px', paddingBottom: '16px' }}>
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

            {/* Footer */}
            <div
              style={{
                flexShrink: 0,
                background: 'var(--bg)',
                borderTop: '1px solid var(--border)',
              }}
            >
              {/* Jellyfin path preview */}
              {jellyfinPath && (
                <div
                  style={{
                    padding: '8px 20px',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ color: 'var(--accent)', marginRight: '4px' }}>📁</span>
                  {jellyfinPath}/
                </div>
              )}

              {/* Actions */}
              <div
                style={{
                  padding: '10px 20px',
                  display: 'flex',
                  gap: '8px',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <span><kbd style={kbdStyle}>A</kbd> approve</span>
                  <span><kbd style={kbdStyle}>S</kbd> skip</span>
                  <span><kbd style={kbdStyle}>← →</kbd> nav</span>
                  <span><kbd style={kbdStyle}>Esc</kbd> close</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button
                    className="btn-secondary"
                    style={{ padding: '6px 16px', fontSize: '13px', borderRadius: '6px' }}
                    onClick={onSkip}
                  >
                    Skip
                  </button>
                  <button
                    className="btn-primary"
                    style={{ padding: '6px 20px', fontSize: '13px', borderRadius: '6px' }}
                    onClick={() => onApprove(suggestion)}
                  >
                    Approve ✓
                  </button>
                </div>
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
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: '3px',
  padding: '1px 5px',
  fontSize: '10px',
  fontFamily: 'monospace',
  color: 'var(--text-muted)',
}
