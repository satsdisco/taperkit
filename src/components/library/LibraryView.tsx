import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  LibraryShow,
  DuplicateGroup,
  LibraryShowSuggestion,
  BatchApplyResult,
} from '../../types'
import SuggestionPanel from '../SuggestionPanel'
import BatchProgress from '../BatchProgress'
import ScanConfig from './ScanConfig'
import FilterBar, { FilterTab, SortBy } from './FilterBar'
import ShowList from './ShowList'
import ApprovedQueue from './ApprovedQueue'
import { useToast } from '../shared/Toast'

const DEFAULT_SOURCES = {
  folders: [''],
  destination: '',
}

type Step = 'config' | 'scanning' | 'results' | 'applying'

interface LibraryViewProps {
  libraryPath?: string
  onLibraryPathChange?: (path: string) => void
  onSwitchToQuickTag?: () => void
}

export default function LibraryView({ libraryPath, onLibraryPathChange, onSwitchToQuickTag }: LibraryViewProps) {
  const { addToast } = useToast()

  const [step, setStep] = useState<Step>('config')
  const [sources, setSources] = useState(() => {
    const path = libraryPath || ''
    return path
      ? { ...DEFAULT_SOURCES, folders: [path] }
      : DEFAULT_SOURCES
  })
  const [scanMsg, setScanMsg] = useState('')
  const [scanCount, setScanCount] = useState(0)
  const [shows, setShows] = useState<LibraryShow[]>([])
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [filter, setFilter] = useState<FilterTab>('all')
  const [reviewShow, setReviewShow] = useState<LibraryShow | null>(null)
  const [approvedSuggestions, setApprovedSuggestions] = useState<LibraryShowSuggestion[]>([])
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set())
  const [applyResults, setApplyResults] = useState<BatchApplyResult[]>([])
  const [applyDone, setApplyDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cleaningUp, setCleaningUp] = useState(false)
  const [cleanupResults, setCleanupResults] = useState<Array<{ path: string; status: string }>>([])
  const [showPostApplyCleanup, setShowPostApplyCleanup] = useState(false)
  const [artistSearch, setArtistSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('artist-az')
  const [configCollapsed, setConfigCollapsed] = useState(false)
  const [quickApprovingIds, setQuickApprovingIds] = useState<Set<string>>(new Set())
  const [panelWidth, setPanelWidth] = useState(480)
  const esRef = useRef<EventSource | null>(null)
  const cleanAfterApplyRef = useRef(false)

  // Auto-collapse scan config when results load
  useEffect(() => {
    if (step === 'results' && shows.length > 0) {
      setConfigCollapsed(true)
    }
  }, [step, shows.length])

  // Toast on scan complete
  useEffect(() => {
    if (step === 'results' && shows.length > 0) {
      addToast(`Scan complete — ${shows.length} shows found`, 'success')
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // Toast on apply complete
  useEffect(() => {
    if (applyDone) {
      const succeeded = applyResults.filter(r => r.success).length
      const failed = applyResults.filter(r => !r.success).length
      if (failed > 0) {
        addToast(`Apply done: ${succeeded} succeeded, ${failed} failed`, 'error')
      } else {
        addToast(`Apply complete — ${succeeded} shows copied`, 'success')
      }
      // Auto-clean if requested
      if (cleanAfterApplyRef.current) {
        cleanAfterApplyRef.current = false
        const donePaths = shows.filter(s => s.alreadyDone && s.folderPath).map(s => s.folderPath)
        cleanupSources(donePaths)
      }
    }
  }, [applyDone]) // eslint-disable-line react-hooks/exhaustive-deps

  // Toast on cleanup done
  useEffect(() => {
    if (cleanupResults.length > 0) {
      const trashed = cleanupResults.filter(r => r.status === 'trashed').length
      addToast(`Cleanup done — ${trashed} folders trashed`, 'info')
    }
  }, [cleanupResults]) // eslint-disable-line react-hooks/exhaustive-deps

  // Toast on error
  useEffect(() => {
    if (error) addToast(error, 'error')
  }, [error]) // eslint-disable-line react-hooks/exhaustive-deps

  const browse = async (field: 'destination' | number) => {
    try {
      const res = await fetch('/api/browse')
      const data = await res.json()
      if (!data.path) return
      if (field === 'destination') {
        setSources(prev => ({ ...prev, destination: data.path }))
      } else {
        setSources(prev => {
          const folders = [...prev.folders]
          folders[field as number] = data.path
          return { ...prev, folders }
        })
        // Save first source folder as the library path
        if (field === 0) {
          onLibraryPathChange?.(data.path)
        }
      }
    } catch { /* ignore */ }
  }

  const browseLibraryPath = async () => {
    try {
      const res = await fetch('/api/browse')
      const data = await res.json()
      if (!data.path) return
      onLibraryPathChange?.(data.path)
      setSources(prev => ({ ...prev, folders: [data.path] }))
    } catch { /* ignore */ }
  }

  const addFolder = () => setSources(prev => ({ ...prev, folders: [...prev.folders, ''] }))
  const removeFolder = (idx: number) =>
    setSources(prev => ({ ...prev, folders: prev.folders.filter((_, i) => i !== idx) }))
  const updateFolder = (idx: number, val: string) =>
    setSources(prev => {
      const folders = [...prev.folders]
      folders[idx] = val
      return { ...prev, folders }
    })

  const startScan = () => {
    setStep('scanning')
    setScanMsg('')
    setScanCount(0)
    setShows([])
    setDuplicateGroups([])
    setError(null)
    setApprovedSuggestions([])
    setSkippedIds(new Set())
    setApplyResults([])
    setApplyDone(false)
    setConfigCollapsed(false)

    const params = new URLSearchParams()
    sources.folders.filter(Boolean).forEach(f => params.append('sources[]', f))
    if (sources.destination) params.append('destination', sources.destination)

    const es = new EventSource(`/api/library/scan?${params}`)
    esRef.current = es

    es.onmessage = async (e) => {
      const event = JSON.parse(e.data)
      if (event.type === 'progress') {
        setScanMsg(event.msg)
        setScanCount(event.current)
      } else if (event.type === 'done') {
        es.close()
        const allShows: LibraryShow[] = event.shows
        try {
          const dedupeRes = await fetch('/api/library/deduplicate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shows: allShows }),
          })
          const dedupeData = await dedupeRes.json()
          setShows(allShows)
          setDuplicateGroups(dedupeData.duplicateGroups || [])
        } catch {
          setShows(allShows)
        }
        setStep('results')
      } else if (event.type === 'error') {
        setError(event.message)
        setStep('config')
        es.close()
      }
    }

    es.onerror = () => {
      setError('Scan connection failed')
      setStep('config')
      es.close()
    }
  }

  const handleApprove = (suggestion: LibraryShowSuggestion) => {
    setApprovedSuggestions(prev => {
      const filtered = prev.filter(s => s.showId !== suggestion.showId)
      return [...filtered, suggestion]
    })
    setReviewShow(null)
  }

  const handleSkip = () => {
    if (reviewShow) {
      setSkippedIds(prev => new Set([...prev, reviewShow.id]))
    }
    setReviewShow(null)
  }

  const handleRemoveApproved = (showId: string) => {
    setApprovedSuggestions(prev => prev.filter(s => s.showId !== showId))
  }

  const quickApprove = async (show: LibraryShow) => {
    setQuickApprovingIds(prev => new Set([...prev, show.id]))
    try {
      const res = await fetch('/api/library/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show }),
      })
      if (res.ok) {
        const suggestion: LibraryShowSuggestion = await res.json()
        setApprovedSuggestions(prev => {
          const filtered = prev.filter(s => s.showId !== suggestion.showId)
          return [...filtered, suggestion]
        })
      }
    } catch { /* ignore */ } finally {
      setQuickApprovingIds(prev => {
        const next = new Set(prev)
        next.delete(show.id)
        return next
      })
    }
  }

  // ref so massApprove can always see latest filteredShows without stale closure
  const filteredShowsRef = useRef<LibraryShow[]>([])

  const massApprove = useCallback(async () => {
    const toApprove = filteredShowsRef.current.filter(
      s => !approvedSuggestions.some(a => a.showId === s.id) && !skippedIds.has(s.id)
    )
    if (toApprove.length === 0) return
    const newSuggestions: LibraryShowSuggestion[] = []
    for (const show of toApprove) {
      try {
        const res = await fetch('/api/library/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ show }),
        })
        if (res.ok) {
          const suggestion: LibraryShowSuggestion = await res.json()
          newSuggestions.push(suggestion)
        }
      } catch { /* skip */ }
    }
    setApprovedSuggestions(prev => {
      const existing = new Set(prev.map(s => s.showId))
      return [...prev, ...newSuggestions.filter(s => !existing.has(s.showId))]
    })
  }, [approvedSuggestions, skippedIds])

  // Keyboard shortcuts
  useEffect(() => {
    if (step !== 'results') return
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return
      switch (e.key) {
        case 'a':
        case 'A':
          if (e.metaKey || e.ctrlKey) { e.preventDefault(); massApprove() }
          break
        case 'Escape':
          if (reviewShow) setReviewShow(null)
          break
        case 'ArrowRight':
        case 'n':
          if (reviewShow) {
            const idx = filteredShowsRef.current.findIndex(s => s.id === reviewShow.id)
            const next = filteredShowsRef.current[idx + 1]
            if (next) setReviewShow(next)
          }
          break
        case 'ArrowLeft':
        case 'p':
          if (reviewShow) {
            const idx = filteredShowsRef.current.findIndex(s => s.id === reviewShow.id)
            const prev = filteredShowsRef.current[idx - 1]
            if (prev) setReviewShow(prev)
          }
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [step, reviewShow, massApprove])

  const startApply = async () => {
    if (approvedSuggestions.length === 0) return
    setStep('applying')
    setApplyResults([])
    setApplyDone(false)

    try {
      if (!sources.destination) {
        setError('No destination folder set. Configure a destination in Source Configuration before applying.')
        return
      }

      const response = await fetch('/api/library/apply-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: approvedSuggestions.map(s => ({ suggestion: s })),
          destinationRoot: sources.destination,
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error('[TaperKit] Apply response not OK:', response.status, errText)
        try {
          const errData = JSON.parse(errText)
          throw new Error(errData.error || `Server error ${response.status}`)
        } catch {
          throw new Error(`Server error ${response.status}: ${errText.slice(0, 200)}`)
        }
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let chunksReceived = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('[TaperKit] Stream done. Total chunks:', chunksReceived, 'Remaining buffer:', JSON.stringify(buffer))
          // Process any remaining data in buffer
          if (buffer.trim()) {
            try {
              const result = JSON.parse(buffer.trim()) as BatchApplyResult
              setApplyResults(prev => [...prev, result])
              console.log('[TaperKit] Parsed final buffer result:', result)
            } catch (e) {
              console.error('[TaperKit] Failed to parse final buffer:', buffer, e)
            }
          }
          break
        }
        chunksReceived++
        const chunk = decoder.decode(value, { stream: true })
        console.log('[TaperKit] Chunk', chunksReceived, ':', JSON.stringify(chunk))
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.trim()) {
            try {
              const result = JSON.parse(line) as BatchApplyResult
              console.log('[TaperKit] Parsed result:', result)
              setApplyResults(prev => [...prev, result])
              if (result.success) {
                setShows(prev => prev.map(s =>
                  s.id === result.showId
                    ? { ...s, alreadyDone: true, destinationPath: result.destinationPath }
                    : s
                ))
                setApprovedSuggestions(prev => prev.filter(s => s.showId !== result.showId))
              } else {
                console.error('[TaperKit] Apply failed for', result.showId, result.error)
              }
            } catch (parseErr) {
              console.error('[TaperKit] Failed to parse apply result line:', line, parseErr)
            }
          }
        }
      }
    } catch (err) {
      console.error('[TaperKit] Apply catch:', err)
      setError(err instanceof Error ? err.message : 'Apply failed')
    } finally {
      setApplyDone(true)
      setShowPostApplyCleanup(true)
    }
  }

  const startApplyAndClean = () => {
    cleanAfterApplyRef.current = true
    startApply()
  }

  const cleanupSources = async (sourcePaths: string[]) => {
    if (sourcePaths.length === 0) {
      console.warn('[TaperKit] cleanupSources called with empty paths')
      setShowPostApplyCleanup(false)
      return
    }
    console.log('[TaperKit] Trashing', sourcePaths.length, 'folders:', sourcePaths)
    setCleaningUp(true)
    setCleanupResults([])
    try {
      const res = await fetch('/api/library/cleanup-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePaths }),
      })
      const data = await res.json()
      console.log('[TaperKit] Cleanup response:', data)
      setCleanupResults(data.results || [])
      const trashedPaths = new Set(
        (data.results || [])
          .filter((r: { status: string }) => r.status === 'trashed')
          .map((r: { path: string }) => r.path)
      )
      if (trashedPaths.size > 0) {
        setShows(prev => prev.filter(s => !trashedPaths.has(s.folderPath)))
      }
    } catch (err) {
      console.error('[TaperKit] Cleanup failed:', err)
      setCleanupResults([{ path: 'all', status: `error: ${err instanceof Error ? err.message : String(err)}` }])
    } finally {
      setCleaningUp(false)
      setShowPostApplyCleanup(false)
    }
  }

  // Build duplicate show ID set
  const duplicateShowIds = new Map<string, { isWinner: boolean; winnerReason: string; groupKey: string }>()
  for (const group of duplicateGroups) {
    for (const s of group.shows) {
      duplicateShowIds.set(s.id, { isWinner: s.isWinner, winnerReason: s.winnerReason, groupKey: group.key })
    }
  }
  const dupShowIdSet = new Set(duplicateShowIds.keys())

  // Tab-filtered shows
  const tabFilteredShows: LibraryShow[] = (() => {
    switch (filter) {
      case 'attention': return shows.filter(s => !s.alreadyDone && s.healthScore < 70)
      case 'duplicates': return shows.filter(s => !s.alreadyDone && dupShowIdSet.has(s.id))
      case 'ready': return shows.filter(s => !s.alreadyDone && s.healthScore >= 70)
      case 'done': return shows.filter(s => s.alreadyDone)
      case 'in-library': return shows.filter(s => s.alreadyDone)
      default: return shows.filter(s => !s.alreadyDone)
    }
  })()

  // Artist search + sort applied on top of tab filter
  const filteredShows = useMemo(() => {
    let list = tabFilteredShows
    if (artistSearch.trim()) {
      const search = artistSearch.toLowerCase()
      list = list.filter(s => (s.artist || '').toLowerCase().includes(search))
    }
    switch (sortBy) {
      case 'artist-az':
        list = [...list].sort((a, b) => (a.artist || '').localeCompare(b.artist || ''))
        break
      case 'date-newest':
        list = [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        break
      case 'date-oldest':
        list = [...list].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        break
      case 'health':
        list = [...list].sort((a, b) => b.healthScore - a.healthScore)
        break
      case 'file-count':
        list = [...list].sort((a, b) => b.fileCount - a.fileCount)
        break
    }
    return list
  }, [tabFilteredShows, artistSearch, sortBy]) // eslint-disable-line react-hooks/exhaustive-deps

  filteredShowsRef.current = filteredShows

  const filteredUnapprovedCount = filteredShows.filter(
    s => !approvedSuggestions.some(a => a.showId === s.id) && !skippedIds.has(s.id)
  ).length

  const inLibraryCount = shows.filter(s => s.alreadyDone).length

  // --- Render ---

  // Welcome / onboarding screen — shown when no library path is configured
  if (!libraryPath && step === 'config') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 52px)',
          padding: '40px 24px',
        }}
      >
        {/* Brand mark */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '16px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                backgroundColor: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '30px',
                color: '#fff',
                boxShadow: '0 4px 20px rgba(233, 69, 96, 0.4)',
              }}
            >
              T
            </div>
            <span style={{ fontSize: '36px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-1px' }}>
              aperKit
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '16px', letterSpacing: '-0.2px' }}>
            Your live music, beautifully organized
          </p>
        </div>

        {/* Action cards */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '32px', width: '100%', maxWidth: '600px' }}>
          {/* Set Up Library */}
          <button
            onClick={browseLibraryPath}
            style={{
              flex: '1 1 220px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: '12px',
              padding: '28px 24px',
              cursor: 'pointer',
              textAlign: 'left',
              color: '#fff',
              boxShadow: '0 4px 20px rgba(233, 69, 96, 0.35)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 8px 28px rgba(233, 69, 96, 0.5)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(233, 69, 96, 0.35)'
            }}
          >
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>📁</div>
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>Set Up Library</div>
            <div style={{ fontSize: '13px', opacity: 0.85, lineHeight: 1.4 }}>
              Choose your live recordings folder to scan and organize your whole collection
            </div>
          </button>

          {/* Quick Tag */}
          <button
            onClick={onSwitchToQuickTag}
            style={{
              flex: '1 1 220px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '28px 24px',
              cursor: 'pointer',
              textAlign: 'left',
              color: 'var(--text)',
              transition: 'transform 0.15s, border-color 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(233, 69, 96, 0.15)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>⚡</div>
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>Quick Tag</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Tag a single recording folder right now — no library setup needed
            </div>
          </button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
          Already have a library? Select your folder above.
        </p>
      </div>
    )
  }

  if (step === 'scanning') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: '20px',
          color: 'var(--text-muted)',
        }}
      >
        <div style={{ fontSize: '40px', animation: 'pulse 2s ease-in-out infinite' }}>📼</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: '18px', marginBottom: '6px' }}>
            Scanning library...
          </div>
          <div style={{ fontSize: '13px', maxWidth: '280px' }}>{scanMsg}</div>
          {scanCount > 0 && (
            <div style={{ fontSize: '13px', marginTop: '8px', color: 'var(--accent)', fontWeight: 600 }}>
              {scanCount} shows found
            </div>
          )}
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.08); opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  if (step === 'applying') {
    return (
      <div>
        <div
          style={{
            padding: '14px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'var(--surface)',
          }}
        >
          {applyDone && (
            <button className="btn-secondary" style={{ borderRadius: '6px' }} onClick={() => setStep('results')}>
              ← Back to results
            </button>
          )}
          <span style={{ fontWeight: 600, fontSize: '14px' }}>
            {applyDone
              ? 'Apply complete'
              : `Copying ${approvedSuggestions.length} shows → ${sources.destination.split('/').pop()}`}
          </span>
        </div>
        <BatchProgress
          approved={approvedSuggestions}
          results={applyResults}
          done={applyDone}
        />
      </div>
    )
  }

  // results + config view
  return (
    <div
      style={{
        padding: '24px',
        paddingRight: reviewShow ? `calc(${panelWidth}px + 24px)` : '24px',
        maxWidth: reviewShow ? 'none' : '1100px',
        margin: reviewShow ? '0' : '0 auto',
        transition: 'padding-right 0.3s ease, max-width 0.3s ease, margin 0.3s ease',
      }}
    >
      {/* Library path display */}
      {libraryPath && step !== 'results' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '16px',
            padding: '10px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: '8px',
          }}
        >
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', flexShrink: 0 }}>Library:</span>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              color: 'var(--text)',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {libraryPath}
          </span>
          <button
            onClick={browseLibraryPath}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '5px',
              color: 'var(--text-muted)',
              fontSize: '11px',
              padding: '3px 8px',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.color = 'var(--accent)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
          >
            Change
          </button>
        </div>
      )}

      <ScanConfig
        sources={sources}
        onFolderUpdate={updateFolder}
        onFolderAdd={addFolder}
        onFolderRemove={removeFolder}
        onDestinationChange={val => setSources(prev => ({ ...prev, destination: val }))}
        onBrowse={browse}
        onScan={startScan}
        error={error}
        hasResults={step === 'results' && shows.length > 0}
        isCollapsed={configCollapsed}
        onToggleCollapse={() => setConfigCollapsed(c => !c)}
      />

      {step === 'results' && shows.length > 0 && (
        <>
          {/* Summary bar */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              marginBottom: '20px',
            }}
          >
            {[
              { label: 'Total', value: shows.length, color: 'var(--accent)', primary: true },
              { label: 'Need Review', value: shows.filter(s => !s.alreadyDone && s.healthScore < 70).length, color: 'var(--warning)', primary: false },
              { label: 'Duplicates', value: duplicateGroups.length, color: 'var(--warning)', primary: false },
              { label: 'Ready', value: shows.filter(s => !s.alreadyDone && s.healthScore >= 70).length, color: 'var(--success)', primary: false },
              { label: 'In Library', value: shows.filter(s => s.alreadyDone).length, color: 'var(--text-muted)', primary: false },
            ].map(card => (
              <div
                key={card.label}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderLeft: card.primary ? '3px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '14px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  flex: '1 1 130px',
                  minWidth: '110px',
                }}
              >
                <div style={{ fontSize: '26px', fontWeight: 800, color: card.color, lineHeight: 1 }}>
                  {card.value}
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                    {card.label}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <ApprovedQueue
            approvedSuggestions={approvedSuggestions}
            onRemove={handleRemoveApproved}
            onApply={startApply}
            onApplyAndClean={startApplyAndClean}
          />

          <FilterBar
            filter={filter}
            onFilterChange={setFilter}
            shows={shows}
            duplicateGroups={duplicateGroups}
            dupShowIdSet={dupShowIdSet}
            approvedSuggestions={approvedSuggestions}
            skippedIds={skippedIds}
            filteredUnapprovedCount={filteredUnapprovedCount}
            onMassApprove={massApprove}
            artistSearch={artistSearch}
            onArtistSearchChange={setArtistSearch}
            sortBy={sortBy}
            onSortByChange={setSortBy}
          />

          {/* Cleanup banner for in-library tab */}
          {filter === 'in-library' && filteredShows.length > 0 && (
            <div
              style={{
                background: 'rgba(33,150,243,0.08)',
                border: '1px solid rgba(33,150,243,0.3)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--text)' }}>
                These {filteredShows.length} items already exist in your library. Source folders can be safely trashed.
              </span>
              <button
                className="btn-secondary"
                disabled={cleaningUp}
                onClick={() => cleanupSources(filteredShows.map(s => s.folderPath))}
                style={{ fontSize: '12px', padding: '4px 12px', flexShrink: 0, marginLeft: 'auto' }}
              >
                {cleaningUp ? 'Cleaning up...' : `🗑 Trash All (${filteredShows.length})`}
              </button>
            </div>
          )}

          {/* Post-apply cleanup prompt */}
          {showPostApplyCleanup && (
            <div
              style={{
                background: 'rgba(76,175,80,0.08)',
                border: '1px solid var(--success)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--text)' }}>
                ✅ Apply complete! Clean up source folders for processed shows?
              </span>
              <button
                className="btn-primary"
                disabled={cleaningUp}
                onClick={() => {
                  const donePaths = shows.filter(s => s.alreadyDone && s.folderPath).map(s => s.folderPath)
                  cleanupSources(donePaths)
                }}
                style={{ fontSize: '12px', padding: '4px 12px', flexShrink: 0, marginLeft: 'auto' }}
              >
                {cleaningUp ? 'Cleaning up...' : '🗑 Trash Source Folders'}
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowPostApplyCleanup(false)}
                style={{ fontSize: '12px', padding: '4px 12px', flexShrink: 0 }}
              >
                Skip
              </button>
            </div>
          )}

          {/* Cleanup results */}
          {cleanupResults.length > 0 && (
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '12px',
                fontSize: '12px',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>
                Cleanup results: {cleanupResults.filter(r => r.status === 'trashed').length} trashed,{' '}
                {cleanupResults.filter(r => r.status !== 'trashed').length} skipped/errors
              </div>
              <button
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '2px 8px' }}
                onClick={() => setCleanupResults([])}
              >
                Dismiss
              </button>
            </div>
          )}

          <ShowList
            shows={filteredShows}
            duplicateInfo={duplicateShowIds}
            duplicateGroups={filter === 'duplicates' ? duplicateGroups : []}
            approvedIds={new Set(approvedSuggestions.map(s => s.showId))}
            skippedIds={skippedIds}
            onReview={setReviewShow}
            onQuickApprove={quickApprove}
            quickApprovingIds={quickApprovingIds}
          />
        </>
      )}

      {step === 'results' && shows.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 24px',
            color: 'var(--text-muted)',
          }}
        >
          No shows found in the scanned folders.
        </div>
      )}

      {/* Suggestion side panel */}
      {reviewShow && (
        <SuggestionPanel
          show={reviewShow}
          onClose={() => setReviewShow(null)}
          onApprove={handleApprove}
          onSkip={handleSkip}
          destinationRoot={sources.destination}
          onWidthChange={setPanelWidth}
        />
      )}
    </div>
  )
}
