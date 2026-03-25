import React, { useState, useEffect } from 'react'

interface FolderPickerProps {
  onFolderSelect: (path: string) => void
  error?: string | null
}

export default function FolderPicker({ onFolderSelect, error }: FolderPickerProps) {
  const [inputValue, setInputValue] = useState('')
  const [recents, setRecents] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/recent')
      .then(r => r.json())
      .then((data: string[]) => setRecents(data))
      .catch(() => {})
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim()) {
      onFolderSelect(inputValue.trim())
    }
  }

  const handleBrowse = async () => {
    try {
      const res = await fetch('/api/browse')
      const data: { path: string | null } = await res.json()
      if (data.path) {
        setInputValue(data.path)
      }
    } catch {
      // ignore
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '80px',
        paddingBottom: '80px',
        minHeight: '80vh',
      }}
    >
      <div style={{ width: '100%', maxWidth: '600px', padding: '0 24px' }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h1
            style={{
              fontSize: '36px',
              fontWeight: 800,
              color: 'var(--accent)',
              letterSpacing: '-1px',
              margin: '0 0 8px 0',
            }}
          >
            TaperKit
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '15px' }}>
            Organise and tag your live music recordings for Jellyfin
          </p>
        </div>

        {/* Folder input */}
        <div
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '24px',
            marginBottom: '24px',
          }}
        >
          <label
            style={{
              display: 'block',
              color: 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '10px',
            }}
          >
            Show folder path
          </label>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder="/Users/you/Music/Shows/2025-11-22 Town Ballroom..."
                style={{ flex: 1, padding: '10px 14px', fontSize: '14px' }}
                autoFocus
              />
              <button
                type="button"
                onClick={handleBrowse}
                className="btn-secondary"
                style={{ whiteSpace: 'nowrap', padding: '10px 16px' }}
              >
                Browse
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={!inputValue.trim()}
                style={{ whiteSpace: 'nowrap', padding: '10px 20px' }}
              >
                Open
              </button>
            </div>
          </form>

          {error && (
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
              {error}
            </div>
          )}

          <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
            Tip: Paste the full path to a folder containing FLAC or MP3 files.
            Disc subfolders (Disc 1/, disc1/, Set 1/) are detected automatically.
          </p>
        </div>

        {/* Recent folders */}
        {recents.length > 0 && (
          <div
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                color: 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Recent folders
            </div>
            {recents.map((folder, idx) => (
              <button
                key={folder}
                onClick={() => onFolderSelect(folder)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  borderBottom: idx < recents.length - 1 ? '1px solid var(--border)' : 'none',
                  padding: '12px 16px',
                  color: 'var(--text)',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255, 140, 66, 0.08)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span style={{ color: 'var(--accent)', marginRight: '8px' }}>→</span>
                {folder}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
