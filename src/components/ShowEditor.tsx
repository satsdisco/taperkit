import React, { useState } from 'react'
import { ShowInfo, ApplyResult } from '../types'
import TrackTable from './TrackTable'
import PreviewPane from './PreviewPane'

interface ShowEditorProps {
  show: ShowInfo
  onShowChange: (show: ShowInfo) => void
}

type Section = 'tracks' | 'preview'

export default function ShowEditor({ show, onShowChange }: ShowEditorProps) {
  const [outputDir, setOutputDir] = useState(show.folderPath)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<Section>('tracks')
  const [writeTags, setWriteTags] = useState(true)

  const updateField = (field: keyof ShowInfo, value: string) => {
    onShowChange({ ...show, [field]: value })
  }

  const handleApply = async () => {
    setApplying(true)
    setApplyResult(null)
    setApplyError(null)

    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show, outputDir, writeTags }),
      })
      const data = await res.json()
      if (!res.ok) {
        setApplyError(data.error || 'Apply failed')
      } else {
        setApplyResult(data as ApplyResult)
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setApplying(false)
    }
  }

  const allSuccess =
    applyResult !== null &&
    applyResult.results.every(r => r.renamed)

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '5px',
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Show metadata panel */}
      <div
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px',
        }}
      >
        <h2
          style={{
            margin: '0 0 16px 0',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Show Info
        </h2>

        {/* Row 1: Artist, Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>Artist</label>
            <input
              type="text"
              value={show.artist}
              onChange={e => updateField('artist', e.target.value)}
              placeholder="Widespread Panic"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input
              type="text"
              value={show.date}
              onChange={e => updateField('date', e.target.value)}
              placeholder="YYYY-MM-DD"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Row 2: Venue, City, State */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>Venue</label>
            <input
              type="text"
              value={show.venue}
              onChange={e => updateField('venue', e.target.value)}
              placeholder="Town Ballroom"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>City</label>
            <input
              type="text"
              value={show.city}
              onChange={e => updateField('city', e.target.value)}
              placeholder="Buffalo"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>State</label>
            <input
              type="text"
              value={show.state}
              onChange={e => updateField('state', e.target.value)}
              placeholder="NY"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Row 3: Source, Notes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Source</label>
            <input
              type="text"
              value={show.source}
              onChange={e => updateField('source', e.target.value)}
              placeholder="SBD, AUD, Matrix..."
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Notes / Comment</label>
            <input
              type="text"
              value={show.notes}
              onChange={e => updateField('notes', e.target.value)}
              placeholder="Taper info, lineage..."
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
        {(['tracks', 'preview'] as Section[]).map(s => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            style={{
              padding: '6px 16px',
              background: activeSection === s ? 'var(--accent)' : 'var(--surface)',
              color: activeSection === s ? '#1a1a1a' : 'var(--text-muted)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              fontWeight: activeSection === s ? 600 : 400,
              fontSize: '13px',
              textTransform: 'capitalize',
            }}
          >
            {s === 'tracks' ? `Tracks (${show.tracks.length})` : 'Preview'}
          </button>
        ))}
      </div>

      {/* Track table */}
      {activeSection === 'tracks' && (
        <TrackTable
          tracks={show.tracks}
          onTracksChange={tracks => onShowChange({ ...show, tracks })}
        />
      )}

      {/* Preview */}
      {activeSection === 'preview' && (
        <PreviewPane show={show} outputDir={outputDir} />
      )}

      {/* Output dir + Apply */}
      <div
        style={{
          marginTop: '20px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px',
        }}
      >
        <h2
          style={{
            margin: '0 0 16px 0',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Output
        </h2>

        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Output directory</label>
          <input
            type="text"
            value={outputDir}
            onChange={e => setOutputDir(e.target.value)}
            placeholder="/Users/you/Music/Jellyfin"
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '13px' }}
          />
          <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
            Files will be moved to: <code style={{ color: 'var(--text)' }}>{outputDir}/{show.artist || 'Artist'}/{[show.date, show.venue].filter(Boolean).join(' ') || 'Album'}/</code>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text)' }}>
            <input
              type="checkbox"
              checked={writeTags}
              onChange={e => setWriteTags(e.target.checked)}
              style={{ width: '14px', height: '14px', accentColor: 'var(--accent)' }}
            />
            Write tags to files (requires metaflac / id3v2)
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            className="btn-primary"
            onClick={handleApply}
            disabled={applying || !show.tracks.length}
            style={{ padding: '10px 28px', fontSize: '15px' }}
          >
            {applying ? 'Applying...' : 'Apply Changes'}
          </button>

          {applyResult && (
            <span style={{ color: allSuccess ? 'var(--success)' : 'var(--warning)', fontSize: '13px' }}>
              {allSuccess
                ? `All ${applyResult.results.length} files processed successfully`
                : `${applyResult.results.filter(r => r.renamed).length}/${applyResult.results.length} renamed`}
            </span>
          )}
        </div>

        {applyError && (
          <div
            style={{
              marginTop: '12px',
              padding: '10px 14px',
              backgroundColor: 'rgba(244, 67, 54, 0.1)',
              border: '1px solid rgba(244, 67, 54, 0.3)',
              borderRadius: '4px',
              color: 'var(--error)',
              fontSize: '13px',
            }}
          >
            {applyError}
          </div>
        )}

        {/* Apply results details */}
        {applyResult && applyResult.results.some(r => r.errors.length > 0) && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Warnings / Errors
            </div>
            {applyResult.results
              .filter(r => r.errors.length > 0)
              .map((r, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'rgba(255, 152, 0, 0.08)',
                    border: '1px solid rgba(255, 152, 0, 0.2)',
                    borderRadius: '4px',
                    marginBottom: '4px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                >
                  <span style={{ color: 'var(--warning)' }}>
                    {r.targetFilePath.split('/').pop()}:
                  </span>{' '}
                  <span style={{ color: 'var(--text-muted)' }}>{r.errors.join(', ')}</span>
                </div>
              ))}
          </div>
        )}

        {/* Tool availability notice */}
        {applyResult && !applyResult.tools.metaflac && writeTags && (
          <div
            style={{
              marginTop: '12px',
              padding: '10px 14px',
              backgroundColor: 'rgba(255, 152, 0, 0.08)',
              border: '1px solid rgba(255, 152, 0, 0.2)',
              borderRadius: '4px',
              color: 'var(--warning)',
              fontSize: '12px',
            }}
          >
            <strong>metaflac not installed.</strong> Files were renamed but FLAC tags were not written.
            Install with: <code>brew install flac</code>
          </div>
        )}
      </div>
    </div>
  )
}
