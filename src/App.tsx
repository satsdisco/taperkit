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

  return (
    <ToastProvider>
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
        {/* Header */}
        <header
          style={{
            backgroundColor: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            padding: '0 24px',
            height: '52px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          {view === 'editor' && (
            <button
              onClick={handleBackToLibrary}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                padding: '4px 8px',
                fontSize: '20px',
                lineHeight: 1,
              }}
              title="Back to library"
            >
              ←
            </button>
          )}
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
            }}
          >
            <span
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--accent)',
                letterSpacing: '-0.5px',
              }}
            >
              TaperKit
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              Live music library manager
            </span>
          </button>

          {/* Nav links */}
          <nav style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
            <button
              onClick={handleBackToLibrary}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '13px',
                cursor: 'pointer',
                color: view === 'library' ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: view === 'library' ? 600 : 400,
                borderBottom: view === 'library' ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              Library
            </button>
            <button
              onClick={() => { setView('single-folder'); setShow(null); setError(null) }}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '13px',
                cursor: 'pointer',
                color: view === 'single-folder' || view === 'editor' ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: view === 'single-folder' || view === 'editor' ? 600 : 400,
                borderBottom: view === 'single-folder' || view === 'editor' ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              Open Single Folder
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
