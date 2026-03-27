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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [libraryPath, setLibraryPath] = useState(() => localStorage.getItem('taperkit-library-path') || '')
  const [settingsBrowsing, setSettingsBrowsing] = useState(false)

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

  const saveLibraryPath = (path: string) => {
    setLibraryPath(path)
    if (path) {
      localStorage.setItem('taperkit-library-path', path)
    } else {
      localStorage.removeItem('taperkit-library-path')
    }
  }

  const handleSettingsBrowse = async () => {
    setSettingsBrowsing(true)
    try {
      const res = await fetch('/api/browse')
      const data: { path: string | null } = await res.json()
      if (data.path) saveLibraryPath(data.path)
    } catch { /* ignore */ } finally {
      setSettingsBrowsing(false)
    }
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
            padding: '0 24px 0 80px',
            height: '52px',
            display: 'flex',
            alignItems: 'stretch',
            gap: '0',
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
                padding: '4px 12px 4px 0',
                fontSize: '18px',
                lineHeight: 1,
                alignSelf: 'center',
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
              padding: '0 16px 0 0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0,
            }}
          >
            {/* "T" badge */}
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                backgroundColor: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '15px',
                color: '#fff',
                letterSpacing: '-0.5px',
                flexShrink: 0,
                boxShadow: '0 1px 4px rgba(233, 69, 96, 0.4)',
              }}
            >
              T
            </div>
            <span
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--text)',
                letterSpacing: '-0.2px',
              }}
            >
              aperKit
            </span>
          </button>

          {/* Separator */}
          <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0, alignSelf: 'center', marginRight: '8px' }} />

          {/* Nav tabs — underline style */}
          <nav style={{ display: 'flex', alignSelf: 'stretch', alignItems: 'stretch' }}>
            <button
              onClick={handleBackToLibrary}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: isLibraryActive ? '2px solid var(--accent)' : '2px solid transparent',
                borderRadius: 0,
                padding: '0 14px',
                fontSize: '13px',
                cursor: 'pointer',
                color: isLibraryActive ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: isLibraryActive ? 600 : 400,
                transition: 'all 0.15s',
                marginBottom: '-1px',
              }}
            >
              Library
            </button>
            <button
              onClick={() => { setView('single-folder'); setShow(null); setError(null) }}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: isSingleActive ? '2px solid var(--accent)' : '2px solid transparent',
                borderRadius: 0,
                padding: '0 14px',
                fontSize: '13px',
                cursor: 'pointer',
                color: isSingleActive ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: isSingleActive ? 600 : 400,
                transition: 'all 0.15s',
                marginBottom: '-1px',
              }}
            >
              Quick Tag
            </button>
          </nav>

          {/* Settings button — pushed to right */}
          <button
            onClick={() => setSettingsOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              padding: '0 4px',
              fontSize: '17px',
              cursor: 'pointer',
              marginLeft: 'auto',
              alignSelf: 'center',
              borderRadius: '6px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'rgba(233, 69, 96, 0.1)'
              e.currentTarget.style.color = 'var(--accent)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
            title="Settings"
          >
            ⚙
          </button>
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

          {!loading && view === 'library' && (
            <LibraryView
              libraryPath={libraryPath}
              onLibraryPathChange={saveLibraryPath}
              onSwitchToQuickTag={() => { setView('single-folder'); setShow(null); setError(null) }}
            />
          )}

          {!loading && view === 'single-folder' && (
            <FolderPicker onFolderSelect={handleFolderSelect} error={error} />
          )}

          {!loading && view === 'editor' && show && (
            <ShowEditor show={show} onShowChange={setShow} />
          )}
        </main>

        {/* Settings Modal */}
        {settingsOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(4px)',
            }}
            onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false) }}
          >
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                width: '480px',
                maxWidth: 'calc(100vw - 48px)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
              }}
            >
              {/* Modal header */}
              <div
                style={{
                  padding: '20px 24px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '16px' }}>Settings</div>
                <button
                  onClick={() => setSettingsOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '18px',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Modal body */}
              <div style={{ padding: '24px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                    marginBottom: '12px',
                  }}
                >
                  Library
                </div>

                <div
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Default Library Folder
                  </div>
                  {libraryPath ? (
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: 'var(--text)',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        marginBottom: '10px',
                        wordBreak: 'break-all',
                      }}
                    >
                      {libraryPath}
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: '13px',
                        color: 'var(--text-muted)',
                        fontStyle: 'italic',
                        marginBottom: '10px',
                      }}
                    >
                      Not set
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      className="btn-primary"
                      onClick={handleSettingsBrowse}
                      disabled={settingsBrowsing}
                      style={{ fontSize: '13px', padding: '6px 14px' }}
                    >
                      {settingsBrowsing ? 'Selecting...' : 'Browse...'}
                    </button>
                    {libraryPath && (
                      <button
                        onClick={() => saveLibraryPath('')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          fontSize: '12px',
                          cursor: 'pointer',
                          padding: '4px 0',
                          textDecoration: 'underline',
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ padding: '0 24px 20px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="btn-secondary"
                  onClick={() => setSettingsOpen(false)}
                  style={{ fontSize: '13px', padding: '7px 18px' }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </ToastProvider>
  )
}
