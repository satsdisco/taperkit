import React, { useState } from 'react'
import FolderPicker from './components/FolderPicker'
import ShowEditor from './components/ShowEditor'
import LibraryView from './components/library/LibraryView'
import { ToastProvider } from './components/shared/Toast'
import { ShowInfo } from './types'

type AppView = 'library' | 'editor' | 'single-folder'

export default function App() {
  const [view, setView] = useState<AppView>('library')
  const [show, setShow] = useState<ShowInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFolderSelect = async (folderPath: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/scan?path=${encodeURIComponent(folderPath)}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Scan failed')
      }
      const data: ShowInfo = await res.json()
      setShow(data)
      setView('editor')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const handleBackToLibrary = () => {
    setView('library')
    setShow(null)
    setError(null)
  }

  const isLibraryActive = view === 'library'
  const isSingleActive = view === 'single-folder' || view === 'editor'

  return (
    <ToastProvider>
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
        {/* Header */}
        <header
          style={{
            backgroundColor: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            padding: '0 24px',
            height: '56px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
          }}
        >
          {/* Back button (editor mode only) */}
          {view === 'editor' && (
            <button
              onClick={handleBackToLibrary}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                padding: '4px 8px',
                fontSize: '18px',
                lineHeight: 1,
              }}
              title="Back to library"
            >
              ←
            </button>
          )}

          {/* Logo */}
          <button
            onClick={handleBackToLibrary}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '20px', lineHeight: 1 }}>📼</span>
            <div style={{ textAlign: 'left' }}>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--text)',
                  letterSpacing: '-0.3px',
                  lineHeight: 1.2,
                }}
              >
                TaperKit
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.2 }}>
                Live music → Jellyfin ready
              </div>
            </div>
          </button>

          {/* Separator */}
          <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }} />

          {/* Nav tabs — pill style */}
          <nav style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={handleBackToLibrary}
              style={{
                background: isLibraryActive ? 'rgba(108, 99, 255, 0.15)' : 'none',
                border: isLibraryActive ? '1px solid rgba(108, 99, 255, 0.35)' : '1px solid transparent',
                borderRadius: '20px',
                padding: '5px 14px',
                fontSize: '13px',
                cursor: 'pointer',
                color: isLibraryActive ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: isLibraryActive ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              Library
            </button>
            <button
              onClick={() => { setView('single-folder'); setShow(null); setError(null) }}
              style={{
                background: isSingleActive ? 'rgba(108, 99, 255, 0.15)' : 'none',
                border: isSingleActive ? '1px solid rgba(108, 99, 255, 0.35)' : '1px solid transparent',
                borderRadius: '20px',
                padding: '5px 14px',
                fontSize: '13px',
                cursor: 'pointer',
                color: isSingleActive ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: isSingleActive ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              Single Folder
            </button>
          </nav>
        </header>

        {/* Main content */}
        <main>
          {loading && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '60vh',
                gap: '16px',
                color: 'var(--text-muted)',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  border: '3px solid var(--border)',
                  borderTopColor: 'var(--accent)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <span>Scanning folder...</span>
            </div>
          )}

          {!loading && view === 'library' && <LibraryView />}

          {!loading && view === 'single-folder' && (
            <FolderPicker onFolderSelect={handleFolderSelect} error={error} />
          )}

          {!loading && view === 'editor' && show && (
            <ShowEditor show={show} onShowChange={setShow} />
          )}
        </main>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </ToastProvider>
  )
}
