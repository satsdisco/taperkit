import React from 'react'

interface Sources {
  folders: string[]
  destination: string
}

interface Props {
  sources: Sources
  onFolderUpdate: (idx: number, val: string) => void
  onFolderAdd: () => void
  onFolderRemove: (idx: number) => void
  onDestinationChange: (val: string) => void
  onBrowse: (field: 'destination' | number) => void
  onScan: () => void
  error: string | null
  hasResults: boolean
  isCollapsed: boolean
  onToggleCollapse: () => void
}

export default function ScanConfig({
  sources,
  onFolderUpdate,
  onFolderAdd,
  onFolderRemove,
  onDestinationChange,
  onBrowse,
  onScan,
  error,
  hasResults,
  isCollapsed,
  onToggleCollapse,
}: Props) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        marginBottom: '24px',
        overflow: 'hidden',
      }}
    >
      {/* Accordion header */}
      <div
        style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: hasResults ? 'pointer' : 'default',
          userSelect: 'none',
        }}
        onClick={hasResults ? onToggleCollapse : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '16px' }}>📁</span>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Source Configuration</span>
        </div>
        {hasResults && (
          <button
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '12px',
              padding: '2px 8px',
              cursor: 'pointer',
            }}
          >
            {isCollapsed ? '▼ expand' : '▲ collapse'}
          </button>
        )}
      </div>

      {!isCollapsed && (
        <div style={{ padding: '0 20px 24px' }}>
          {/* Divider */}
          <div style={{ height: '1px', background: 'var(--border)', marginBottom: '20px' }} />

          {/* Source folders */}
          <div style={{ marginBottom: '16px' }}>
            <div className="section-label" style={{ marginBottom: '10px' }}>Source Folders</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sources.folders.map((folder, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                      fontWeight: 600,
                    }}
                  >
                    {idx + 1}
                  </div>
                  <input
                    value={folder}
                    onChange={e => onFolderUpdate(idx, e.target.value)}
                    placeholder="/path/to/music folder"
                    style={{
                      flex: 1,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '7px 11px',
                      color: 'var(--text)',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <button
                    className="btn-secondary"
                    style={{ fontSize: '12px', padding: '6px 12px', flexShrink: 0 }}
                    onClick={() => onBrowse(idx)}
                  >
                    Browse
                  </button>
                  <button
                    onClick={() => onFolderRemove(idx)}
                    title="Remove this source"
                    style={{
                      background: 'none',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      color: 'var(--error)',
                      cursor: 'pointer',
                      padding: '6px 10px',
                      fontSize: '13px',
                      flexShrink: 0,
                      opacity: 0.7,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              className="btn-secondary"
              style={{ fontSize: '12px', marginTop: '10px', borderRadius: '6px' }}
              onClick={onFolderAdd}
            >
              + Add Source Folder
            </button>
          </div>

          {/* Destination */}
          <div style={{ marginBottom: '20px' }}>
            <div className="section-label" style={{ marginBottom: '10px' }}>Jellyfin Destination</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                value={sources.destination}
                onChange={e => onDestinationChange(e.target.value)}
                placeholder="/path/to/New Music Library"
                style={{
                  flex: 1,
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '7px 11px',
                  color: 'var(--text)',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                }}
              />
              <button
                className="btn-secondary"
                style={{ fontSize: '12px', padding: '6px 12px', flexShrink: 0 }}
                onClick={() => onBrowse('destination')}
              >
                Browse
              </button>
            </div>
            {sources.destination && (
              <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                Output: <span style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>
                  {sources.destination}/Artist/YYYY-MM-DD Venue, City, ST/
                </span>
              </div>
            )}
          </div>

          {/* CTA */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              className="btn-primary"
              onClick={onScan}
              style={{
                padding: '10px 28px',
                fontSize: '14px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>▶</span> Scan Library
            </button>
            {error && (
              <span style={{ color: 'var(--error)', fontSize: '13px' }}>{error}</span>
            )}
          </div>
        </div>
      )}

      {/* Collapsed summary */}
      {isCollapsed && (
        <div style={{ padding: '0 20px 14px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {sources.folders.filter(Boolean).map((f, i) => (
            <span key={i}>
              {i > 0 && <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>}
              {f.split('/').pop()}
            </span>
          ))}
          {sources.destination && (
            <span style={{ color: 'var(--accent)', marginLeft: '8px' }}>
              → {sources.destination.split('/').pop()}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
