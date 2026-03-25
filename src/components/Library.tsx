import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  LibraryShow,
  DuplicateGroup,
  DuplicateShow,
  LibraryShowSuggestion,
  BatchApplyResult,
} from '../types'
import SuggestionPanel from './SuggestionPanel'
import BatchProgress from './BatchProgress'

const DEFAULT_SOURCES = {
  folders: [
    '/Volumes/External/media/1 Music',
    '/Volumes/External/media/1 Music.backup.20260213',
  ],
  destination: '/Volumes/External/media/New Music Library',
}

type Step = 'config' | 'scanning' | 'results' | 'applying'
type FilterTab = 'all' | 'attention' | 'duplicates' | 'ready' | 'done'

function HealthBadge({ score }: { score: number }) {
  const [emoji, color] =
    score >= 70 ? ['✅', 'var(--success)'] : score >= 40 ? ['⚠️', 'var(--warning)'] : ['❌', 'var(--error)']
  return (
    <span
      title={`Health: ${score}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '12px',
        padding: '2px 8px',
        borderRadius: '12px',
        background: `${color}22`,
        border: `1px solid ${color}44`,
        color,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {emoji} {score}
    </span>
  )
}

export default function Library() {
  const [step, setStep] = useState<Step>('config')
  const [sources, setSources] = useState(DEFAULT_SOURCES)
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
  const esRef = useRef<EventSource | null>(null)

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
      }
    } catch { /* ignore */ }
  }

  const addFolder = () => setSources(prev => ({ ...prev, folders: [...prev.folders, ''] }))
  const removeFolder = (idx: number) => setSources(prev => ({ ...prev, folders: prev.folders.filter((_, i) => i !== idx) }))
  const updateFolder = (idx: number, val: string) => setSources(prev => {
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
        // Deduplicate
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

  // ref so massApprove can always see latest filteredShows without stale closure
  const filteredShowsRef = useRef<LibraryShow[]>([])

  // Mass approve all shows in the current filtered view
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
      // Don't fire if typing in an input
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
      const response = await fetch('/api/library/apply-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: approvedSuggestions.map(s => ({ suggestion: s })),
          destinationRoot: sources.destination,
        }),
      })

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.trim()) {
            try {
              const result = JSON.parse(line) as BatchApplyResult
              setApplyResults(prev => [...prev, result])
              // Mark show as done immediately in the shows list
              if (result.success) {
                setShows(prev => prev.map(s =>
                  s.id === result.showId ? { ...s, alreadyDone: true, destinationPath: result.destinationPath } : s
                ))
                // Remove from approved queue
                setApprovedSuggestions(prev => prev.filter(s => s.showId !== result.showId))
              }
            } catch { /* skip malformed line */ }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed')
    } finally {
      setApplyDone(true)
    }
  }

  // Build duplicate show ID set for badge display
  const duplicateShowIds = new Map<string, { isWinner: boolean; winnerReason: string; groupKey: string }>()
  for (const group of duplicateGroups) {
    for (const s of group.shows) {
      duplicateShowIds.set(s.id, { isWinner: s.isWinner, winnerReason: s.winnerReason, groupKey: group.key })
    }
  }

  // Filter shows for list
  const dupShowIdSet = new Set(duplicateShowIds.keys())

  const filteredShows: LibraryShow[] = (() => {
    switch (filter) {
      case 'attention': return shows.filter(s => !s.alreadyDone && s.healthScore < 70)
      case 'duplicates': return shows.filter(s => !s.alreadyDone && dupShowIdSet.has(s.id))
      case 'ready': return shows.filter(s => !s.alreadyDone && s.healthScore >= 70)
      case 'done': return shows.filter(s => s.alreadyDone)
      default: return shows.filter(s => !s.alreadyDone)
    }
  })()
  filteredShowsRef.current = filteredShows

  const doneCount = shows.filter(s => s.alreadyDone).length
  const needsAttentionCount = shows.filter(s => !s.alreadyDone && s.healthScore < 70).length
  const readyCount = shows.filter(s => !s.alreadyDone && s.healthScore >= 70).length
  const dupeShowCount = shows.filter(s => !s.alreadyDone && dupShowIdSet.has(s.id)).length

  // --- Render ---

  if (step === 'scanning') {
    return (
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
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: '4px' }}>
            Scanning library...
          </div>
          <div style={{ fontSize: '13px' }}>{scanMsg}</div>
          {scanCount > 0 && (
            <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--accent)' }}>
              {scanCount} shows found so far
            </div>
          )}
        </div>
      </div>
    )
  }

  if (step === 'applying') {
    return (
      <div>
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          {applyDone && (
            <button className="btn-secondary" onClick={() => setStep('results')}>
              ← Back to results
            </button>
          )}
          <span style={{ fontWeight: 600 }}>
            Applying {approvedSuggestions.length} shows to {sources.destination}
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

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>
      {/* Source config */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '24px',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '16px', fontSize: '14px' }}>Source Folders</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', marginBottom: '12px' }}>
          {sources.folders.map((folder, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ width: '70px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>
                Source {idx + 1}
              </label>
              <input
                value={folder}
                onChange={e => updateFolder(idx, e.target.value)}
                placeholder="/path/to/music folder"
                style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px 10px', color: 'var(--text)', fontSize: '13px', fontFamily: 'monospace' }}
              />
              <button className="btn-secondary" style={{ fontSize: '12px', padding: '5px 10px', flexShrink: 0 }} onClick={() => browse(idx)}>
                Browse
              </button>
              <button
                onClick={() => removeFolder(idx)}
                title="Remove this source"
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--error)', cursor: 'pointer', padding: '5px 8px', fontSize: '14px', flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button className="btn-secondary" style={{ fontSize: '12px', marginBottom: '16px' }} onClick={addFolder}>
          + Add Source Folder
        </button>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ width: '70px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>
            Destination
          </label>
          <input
            value={sources.destination}
            onChange={e => setSources(prev => ({ ...prev, destination: e.target.value }))}
            placeholder="/path/to/New Music Library"
            style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px 10px', color: 'var(--text)', fontSize: '13px', fontFamily: 'monospace' }}
          />
          <button className="btn-secondary" style={{ fontSize: '12px', padding: '5px 10px', flexShrink: 0 }} onClick={() => browse('destination')}>
            Browse
          </button>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button className="btn-primary" onClick={startScan}>
            Scan Library
          </button>
          {error && (
            <span style={{ color: 'var(--error)', fontSize: '13px' }}>{error}</span>
          )}
        </div>
      </div>

      {/* Results dashboard */}
      {step === 'results' && shows.length > 0 && (
        <>
          {/* Summary cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
            {[
              { label: 'Total Shows', value: shows.length, color: 'var(--accent)' },
              { label: 'Duplicates Detected', value: duplicateGroups.length, color: 'var(--warning)' },
              { label: 'Needs Attention', value: needsAttentionCount, color: 'var(--error)' },
              { label: 'Ready to Copy', value: readyCount, color: 'var(--success)' },
              { label: 'Already Done', value: doneCount, color: 'var(--text-muted)' },
            ].map(card => (
              <div
                key={card.label}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '28px', fontWeight: 700, color: card.color }}>
                  {card.value}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {card.label}
                </div>
              </div>
            ))}
          </div>

          {/* Approved queue + Apply button */}
          {approvedSuggestions.length > 0 && (
            <div
              style={{
                background: 'rgba(76,175,80,0.08)',
                border: '1px solid var(--success)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                {approvedSuggestions.length} approved
              </span>
              <div style={{ flex: 1, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {approvedSuggestions.slice(0, 8).map(s => (
                  <span
                    key={s.showId}
                    style={{
                      fontSize: '11px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {s.artist} {s.date}
                    <button
                      onClick={() => handleRemoveApproved(s.showId)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 0 0 2px', fontSize: '12px', lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {approvedSuggestions.length > 8 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    +{approvedSuggestions.length - 8} more
                  </span>
                )}
              </div>
              <button className="btn-primary" onClick={startApply}>
                Apply {approvedSuggestions.length} shows →
              </button>
            </div>
          )}

          {/* Mass approve + keyboard hints */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                className="btn-secondary"
                onClick={massApprove}
                disabled={filteredShows.filter(s => !approvedSuggestions.some(a => a.showId === s.id) && !skippedIds.has(s.id)).length === 0}
                style={{ fontSize: '12px', padding: '4px 12px' }}
              >
                ✓ Approve All Visible ({filteredShows.filter(s => !approvedSuggestions.some(a => a.showId === s.id) && !skippedIds.has(s.id)).length})
              </button>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '12px' }}>
              <span>⌘A approve all</span>
              <span>← → navigate</span>
              <span>Esc close panel</span>
            </div>
          </div>

          {/* Filter tabs */}
          <div
            style={{
              display: 'flex',
              gap: '4px',
              marginBottom: '16px',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '0',
            }}
          >
            {(
              [
                { id: 'all', label: `Pending (${shows.filter(s => !s.alreadyDone).length})` },
                { id: 'attention', label: `Needs Attention (${needsAttentionCount})` },
                { id: 'duplicates', label: `Duplicates (${dupeShowCount})` },
                { id: 'ready', label: `Ready (${readyCount})` },
                { id: 'done', label: `✅ Done (${doneCount})` },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: filter === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                  color: filter === tab.id ? 'var(--accent)' : 'var(--text-muted)',
                  padding: '8px 16px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: filter === tab.id ? 600 : 400,
                  marginBottom: '-1px',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Show list */}
          <ShowList
            shows={filteredShows}
            duplicateInfo={duplicateShowIds}
            duplicateGroups={filter === 'duplicates' ? duplicateGroups : []}
            approvedIds={new Set(approvedSuggestions.map(s => s.showId))}
            skippedIds={skippedIds}
            onReview={setReviewShow}
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

      {/* Suggestion panel overlay */}
      {reviewShow && (
        <SuggestionPanel
          show={reviewShow}
          onClose={() => setReviewShow(null)}
          onApprove={handleApprove}
          onSkip={handleSkip}
        />
      )}
    </div>
  )
}

// --- Show list sub-component ---

interface ShowListProps {
  shows: LibraryShow[]
  duplicateInfo: Map<string, { isWinner: boolean; winnerReason: string; groupKey: string }>
  duplicateGroups: DuplicateGroup[]
  approvedIds: Set<string>
  skippedIds: Set<string>
  onReview: (show: LibraryShow) => void
}

function ShowList({ shows, duplicateInfo, duplicateGroups, approvedIds, skippedIds, onReview }: ShowListProps) {
  if (duplicateGroups.length > 0) {
    // Grouped view for duplicates tab
    return (
      <div>
        {duplicateGroups.map(group => (
          <div
            key={group.key}
            style={{
              marginBottom: '16px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '8px 16px',
                background: 'rgba(255,152,0,0.08)',
                fontSize: '11px',
                color: 'var(--warning)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Duplicate Group — {group.shows[0].artist} {group.shows[0].date}
            </div>
            {group.shows.map(s => (
              <ShowRow
                key={s.id}
                show={s}
                dupInfo={{ isWinner: s.isWinner, winnerReason: s.winnerReason, groupKey: group.key }}
                isApproved={approvedIds.has(s.id)}
                isSkipped={skippedIds.has(s.id)}
                onReview={onReview}
              />
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {shows.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No shows in this category.
        </div>
      ) : (
        shows.map(s => (
          <ShowRow
            key={s.id}
            show={s}
            dupInfo={duplicateInfo.get(s.id)}
            isApproved={approvedIds.has(s.id)}
            isSkipped={skippedIds.has(s.id)}
            onReview={onReview}
          />
        ))
      )}
    </div>
  )
}

interface ShowRowProps {
  show: LibraryShow
  dupInfo?: { isWinner: boolean; winnerReason: string; groupKey: string }
  isApproved: boolean
  isSkipped: boolean
  onReview: (show: LibraryShow) => void
}

function ShowRow({ show, dupInfo, isApproved, isSkipped, onReview }: ShowRowProps) {
  const truncatePath = (p: string) => {
    if (p.length <= 60) return p
    const parts = p.split('/')
    if (parts.length <= 3) return p
    return '.../' + parts.slice(-2).join('/')
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        background: isApproved ? 'rgba(76,175,80,0.04)' : isSkipped ? 'rgba(0,0,0,0.2)' : 'transparent',
        opacity: isSkipped ? 0.5 : 1,
      }}
    >
      <HealthBadge score={show.healthScore} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 500, fontSize: '13px' }}>
            {show.artist || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unknown Artist</span>}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{show.date}</span>
          {show.venue && (
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {show.venue}{show.city ? `, ${show.city}` : ''}
            </span>
          )}
          {dupInfo && (
            <span
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '10px',
                background: dupInfo.isWinner ? 'rgba(76,175,80,0.15)' : 'rgba(255,152,0,0.15)',
                color: dupInfo.isWinner ? 'var(--success)' : 'var(--warning)',
                border: `1px solid ${dupInfo.isWinner ? 'var(--success)' : 'var(--warning)'}44`,
                fontWeight: 600,
              }}
            >
              {dupInfo.isWinner ? `Winner (${dupInfo.winnerReason})` : 'Duplicate'}
            </span>
          )}
          {isApproved && (
            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'rgba(76,175,80,0.15)', color: 'var(--success)', border: '1px solid rgba(76,175,80,0.3)', fontWeight: 600 }}>
              Approved
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            fontFamily: 'monospace',
            marginTop: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {truncatePath(show.folderPath)}
          <span style={{ marginLeft: '8px', color: 'var(--border)' }}>
            {show.fileCount} files · {show.hasFlac ? 'FLAC' : 'MP3'}
          </span>
        </div>
        {show.healthIssues.length > 0 && (
          <div style={{ fontSize: '11px', color: 'var(--warning)', marginTop: '2px' }}>
            {show.healthIssues.join(' · ')}
          </div>
        )}
      </div>

      <button
        className="btn-secondary"
        style={{ fontSize: '12px', padding: '4px 10px', flexShrink: 0 }}
        onClick={() => onReview(show)}
      >
        Review
      </button>
    </div>
  )
}
