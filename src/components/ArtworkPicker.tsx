import React, { useState, useRef, useEffect } from 'react'

interface ArtworkPickerProps {
  artist: string
  date: string
  venue: string
  city: string
  state: string
  albumTitle?: string
  releaseType?: 'live' | 'album'
  destDir?: string
  artistDir?: string
  onArtworkChange?: (dataUrl: string | null) => void
}

export default function ArtworkPicker({
  artist,
  date,
  venue,
  city,
  state,
  albumTitle,
  releaseType,
  destDir,
  artistDir,
  onArtworkChange,
}: ArtworkPickerProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [existingImages, setExistingImages] = useState<Array<{ name: string; dataUrl: string }>>([])
  const [loading, setLoading] = useState<'fetch' | 'generate' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load existing artwork from destDir and artistDir on mount / when dirs change
  useEffect(() => {
    const dirs = [destDir, artistDir].filter(Boolean) as string[]
    if (dirs.length === 0) return
    const found: Array<{ name: string; dataUrl: string }> = []
    Promise.all(
      dirs.map(dir =>
        fetch(`/api/artwork/existing?dir=${encodeURIComponent(dir)}`)
          .then(r => r.json())
          .then((d: { images: Array<{ name: string; dataUrl: string }> }) => {
            d.images.forEach(img => {
              if (!found.some(f => f.name === img.name)) found.push(img)
            })
          })
          .catch(() => {})
      )
    ).then(() => {
      setExistingImages([...found])
      // Auto-load the first existing image as current if none set
      if (!dataUrl && found.length > 0) {
        setDataUrl(found[0].dataUrl)
      }
    })
  }, [destDir, artistDir])

  const setImage = (url: string | null) => {
    setDataUrl(url)
    setSaved(false)
    setError(null)
    onArtworkChange?.(url)
  }

  const handleFetch = async () => {
    if (!artist) { setError('Enter an artist name first'); return }
    setLoading('fetch')
    setError(null)
    try {
      const resp = await fetch(`/api/artwork/fetch-artist?artist=${encodeURIComponent(artist)}`)
      const data = await resp.json() as { dataUrl: string | null; error?: string }
      if (!resp.ok) throw new Error(data.error || 'Fetch failed')
      if (data.dataUrl) {
        setImage(data.dataUrl)
      } else {
        setError('No artist photo found')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      setLoading(null)
    }
  }

  const handleGenerate = async () => {
    setLoading('generate')
    setError(null)
    try {
      const resp = await fetch('/api/artwork/generate-poster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist, date, venue, city, state }),
      })
      const data = await resp.json() as { dataUrl: string; error?: string }
      if (!resp.ok) throw new Error(data.error || 'Generate failed')
      setImage(data.dataUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generate failed')
    } finally {
      setLoading(null)
    }
  }

  const handleSave = async () => {
    if (!dataUrl || !destDir) return
    setLoading('save')
    setError(null)
    setSaved(false)
    try {
      const resp = await fetch('/api/artwork/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destDir, artistDir, dataUrl }),
      })
      const data = await resp.json() as { ok?: boolean; error?: string }
      if (!resp.ok) throw new Error(data.error || 'Save failed')
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setLoading(null)
    }
  }

  const readFileAsDataUrl = (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Only image files supported'); return }
    const reader = new FileReader()
    reader.onload = e => {
      const result = e.target?.result
      if (typeof result === 'string') setImage(result)
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) readFileAsDataUrl(file)
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    fontSize: '12px',
    background: active ? 'var(--accent)' : 'var(--surface)',
    color: active ? '#1a1a1a' : 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    whiteSpace: 'nowrap' as const,
    opacity: loading ? 0.6 : 1,
  })

  const spinner = (
    <span style={{
      display: 'inline-block',
      width: '10px',
      height: '10px',
      border: '2px solid currentColor',
      borderTopColor: 'transparent',
      borderRadius: '50%',
      animation: 'spin 0.6s linear infinite',
    }} />
  )

  return (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Preview square */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div
          style={{
            width: '120px',
            height: '120px',
            background: dataUrl ? 'transparent' : 'var(--surface)',
            border: `1px solid ${dataUrl ? 'transparent' : 'var(--border)'}`,
            borderRadius: '6px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {dataUrl ? (
            <img src={dataUrl} alt="artwork" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: '28px', opacity: 0.3 }}>🎵</span>
          )}
        </div>
        {dataUrl && (
          <button
            onClick={() => setImage(null)}
            title="Clear"
            style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: '#333',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Controls */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
          Artwork
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {releaseType === 'album' && albumTitle ? (
            <button style={btnStyle(false)} onClick={async () => {
              setLoading('fetch'); setError(null)
              try {
                const r = await fetch(`/api/artwork/search-album?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(albumTitle)}`)
                const d = await r.json() as { dataUrl: string | null }
                if (d.dataUrl) setImage(d.dataUrl)
                else setError('No album art found in database')
              } catch { setError('Search failed') }
              finally { setLoading(null) }
            }} disabled={!!loading}>
              {loading === 'fetch' ? spinner : '💿'} Search Album Art
            </button>
          ) : (
            <button style={btnStyle(false)} onClick={handleFetch} disabled={!!loading}>
              {loading === 'fetch' ? spinner : '🔍'} Fetch Artist Photo
            </button>
          )}
          <button style={btnStyle(false)} onClick={handleGenerate} disabled={!!loading}>
            {loading === 'generate' ? spinner : '🎨'} Generate Poster
          </button>

          {/* Drop zone / file picker */}
          <div
            onClick={() => !loading && fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              background: dragOver ? 'rgba(255, 140, 66, 0.12)' : 'var(--surface)',
              color: dragOver ? 'var(--accent)' : 'var(--text-muted)',
              border: `1px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: '4px',
              cursor: loading ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
              opacity: loading ? 0.6 : 1,
            }}
          >
            📂 Drop image or click
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) readFileAsDataUrl(f); e.target.value = '' }}
          />
        </div>

        {/* Save button */}
        {destDir && dataUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              style={{
                ...btnStyle(false),
                background: saved ? 'rgba(76, 175, 80, 0.15)' : 'var(--surface)',
                color: saved ? 'var(--success)' : 'var(--accent)',
                border: `1px solid ${saved ? 'rgba(76, 175, 80, 0.3)' : 'var(--accent)'}`,
              }}
              onClick={handleSave}
              disabled={!!loading || saved}
            >
              {loading === 'save' ? spinner : saved ? '✓' : '💾'}{' '}
              {saved ? 'Saved' : 'Save to folder'}
            </button>
            {saved && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                folder.jpg written
              </span>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--error)' }}>
            {error}
          </div>
        )}

        {/* Existing images strip */}
        {existingImages.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Existing ({existingImages.length})
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {existingImages.map((img, i) => (
                <div
                  key={i}
                  title={img.name}
                  onClick={() => setImage(img.dataUrl)}
                  style={{
                    width: '48px', height: '48px', borderRadius: '4px', overflow: 'hidden', cursor: 'pointer',
                    border: dataUrl === img.dataUrl ? '2px solid var(--accent)' : '2px solid var(--border)',
                    flexShrink: 0,
                  }}
                >
                  <img src={img.dataUrl} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
