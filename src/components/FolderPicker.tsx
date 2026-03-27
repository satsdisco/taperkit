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
      <div style={{ width: '100%', maxWidth: '560px', padding: '0 24px' }}>
        {/* Heading */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚡</div>
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 800,
              color: 'var(--text)',
              letterSpacing: '-0.5px',
              margin: '0 0 10px 0',
            }}
          >
            Tag a Recording
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '14px', lineHeight: 1.5 }}>
            Select a folder containing a live recording to clean up and tag
          </p>
        </div>

        {/* Browse action */}
        <div
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '28px 24px',
            marginBottom: '20px',
            textAlign: 'center',
          }}
        >
          <button
            type="button"
            onClick={handleBrowse}
            className="btn-primary"
            style={{
              padding: '12px 32px',
              fontSize: '15px',
              fontWeight: 700,
              borderRadius: '8px',
              marginBottom: inputValue ? '16px' : '0',
            }}
          >
            Browse Folder
          </button>

          {/* Path display after selection */}
          {inputValue && (
            <form onSubmit={handleSubmit}>
              <div
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  marginBottom: '14px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: 'var(--text)',
                  textAlign: 'left',
                  wordBreak: 'break-all',
                  lineHeight: 1.5,
                }}
              >
                {inputValue}
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: '9px 28px', fontSize: '14px' }}
                >
                  Open →
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setInputValue('')}
                  style={{ padding: '9px 16px', fontSize: '14px' }}
                >
                  Clear
                </button>
              </div>
            </form>
          )}

          {!inputValue && (
            <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Or paste a path manually below
            </p>
          )}
        </div>

        {/* Manual input */}
        {!inputValue && (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder="/path/to/2025-11-22 Town Ballroom..."
                style={{ flex: 1, padding: '10px 14px', fontSize: '13px', fontFamily: 'monospace' }}
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={!inputValue.trim()}
                style={{ whiteSpace: 'nowrap', padding: '10px 18px' }}
              >
                Open
              </button>
            </div>
          </form>
        )}

        {error && (
          <div
            style={{
              marginTop: '12px',
              padding: '10px 14px',
              backgroundColor: 'rgba(233, 69, 96, 0.1)',
              border: '1px solid rgba(233, 69, 96, 0.3)',
              borderRadius: '6px',
              color: 'var(--error)',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        {/* Recent folders */}
        {recents.length > 0 && (
          <div
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              overflow: 'hidden',
              marginTop: '20px',
            }}
          >
            <div
              style={{
                padding: '10px 16px',
                borderBottom: '1px solid var(--border)',
                color: 'var(--text-muted)',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Recent
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
                  padding: '11px 16px',
                  color: 'var(--text)',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(233, 69, 96, 0.06)')}
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
