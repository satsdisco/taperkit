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
        borderRadius: '8px',
        marginBottom: '24px',
        overflow: 'hidden',
      }}
    >
      {/* Accordion header */}
      <div
        style={{
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: hasResults ? 'pointer' : 'default',
          userSelect: 'none',
        }}
        onClick={hasResults ? onToggleCollapse : undefined}
      >
        <span style={{ fontWeight: 600, fontSize: '14px' }}>Source Configuration</span>
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
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', marginBottom: '12px' }}>
            {sources.folders.map((folder, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <label
                  style={{
                    width: '70px',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    flexShrink: 0,
                  }}
                >
                  Source {idx + 1}
                </label>
                <input
                  value={folder}
                  onChange={e => onFolderUpdate(idx, e.target.value)}
                  placeholder="/path/to/music folder"
                  style={{
                    flex: 1,
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    color: 'var(--text)',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                  }}
                />
                <button
                  className="btn-secondary"
                  style={{ fontSize: '12px', padding: '5px 10px', flexShrink: 0 }}
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
                    borderRadius: '4px',
                    color: 'var(--error)',
                    cursor: 'pointer',
                    padding: '5px 8px',
                    fontSize: '14px',
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            className="btn-secondary"
            style={{ fontSize: '12px', marginBottom: '16px' }}
            onClick={onFolderAdd}
          >
            + Add Source Folder
          </button>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
            <label
              style={{
                width: '70px',
                fontSize: '11px',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                flexShrink: 0,
              }}
            >
              Destination
            </label>
            <input
              value={sources.destination}
              onChange={e => onDestinationChange(e.target.value)}
              placeholder="/path/to/New Music Library"
              style={{
                flex: 1,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '6px 10px',
                color: 'var(--text)',
                fontSize: '13px',
                fontFamily: 'monospace',
              }}
            />
            <button
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '5px 10px', flexShrink: 0 }}
              onClick={() => onBrowse('destination')}
            >
              Browse
            </button>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button className="btn-primary" onClick={onScan}>
              Scan Library
            </button>
            {error && (
              <span style={{ color: 'var(--error)', fontSize: '13px' }}>{error}</span>
            )}
          </div>
        </div>
      )}

      {isCollapsed && (
        <div style={{ padding: '0 20px 12px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {sources.folders.filter(Boolean).join(' · ')}
          {sources.destination && (
            <span style={{ color: 'var(--accent)', marginLeft: '8px' }}>→ {sources.destination.split('/').pop()}</span>
          )}
        </div>
      )}
    </div>
  )
}
