import React, { useRef, useEffect, useState } from 'react'
import { BatchApplyResult, LibraryShowSuggestion } from '../types'

interface Props {
  approved: LibraryShowSuggestion[]
  results: BatchApplyResult[]
  done: boolean
}

export default function BatchProgress({ approved, results, done }: Props) {
  const total = approved.length
  const completed = results.length
  const succeeded = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  const startTimeRef = useRef<number | null>(null)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    if (results.length > 0 && startTimeRef.current === null) {
      startTimeRef.current = Date.now()
    }
  }, [results.length])

  // Tick for ETA display
  useEffect(() => {
    if (done || completed === 0) return
    const interval = setInterval(() => forceUpdate(n => n + 1), 1000)
    return () => clearInterval(interval)
  }, [done, completed])

  let etaLabel = ''
  if (!done && completed > 0 && startTimeRef.current !== null) {
    const elapsed = (Date.now() - startTimeRef.current) / 1000
    const rate = completed / elapsed
    const remaining = total - completed
    const etaSecs = rate > 0 ? Math.round(remaining / rate) : 0
    if (etaSecs > 60) {
      etaLabel = `~${Math.ceil(etaSecs / 60)}m remaining`
    } else if (etaSecs > 0) {
      etaLabel = `~${etaSecs}s remaining`
    }
  }

  const resultMap = new Map(results.map(r => [r.showId, r]))
  const barColor = done && failed === 0 ? 'var(--success)' : done && failed > 0 ? 'var(--error)' : 'var(--accent)'

  return (
    <div style={{ padding: '32px 24px', maxWidth: '680px', margin: '0 auto' }}>

      {/* Progress header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
          <span style={{ fontWeight: 700, fontSize: '18px', color: 'var(--text)' }}>
            {done
              ? failed === 0 ? '✓ Done!' : '⚠ Completed with errors'
              : 'Copying shows...'}
          </span>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline', color: 'var(--text-muted)', fontSize: '13px' }}>
            {etaLabel && <span style={{ fontSize: '12px' }}>{etaLabel}</span>}
            <span style={{ fontWeight: 700, color: barColor, fontSize: '20px' }}>{pct}%</span>
            <span>{completed} / {total}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: '8px',
            background: 'var(--border)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: barColor,
              borderRadius: '4px',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* Done summary */}
      {done && (
        <div
          style={{
            padding: '16px 20px',
            borderRadius: '10px',
            marginBottom: '24px',
            background: failed > 0 ? 'rgba(252, 92, 101, 0.08)' : 'rgba(72, 187, 120, 0.08)',
            border: `1px solid ${failed > 0 ? 'rgba(252, 92, 101, 0.3)' : 'rgba(72, 187, 120, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <span style={{ fontSize: '28px' }}>{failed === 0 ? '🎉' : '⚠️'}</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '2px' }}>
              {failed === 0
                ? `${succeeded} shows copied successfully`
                : `${succeeded} succeeded, ${failed} failed`}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {failed === 0
                ? 'Your library is ready in Jellyfin'
                : 'Check the errors below for details'}
            </div>
          </div>
        </div>
      )}

      {/* Per-show status */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
      >
        {approved.map((s, i) => {
          const result = resultMap.get(s.showId)
          const isPending = !result
          const isSuccess = result?.success
          const isLast = i === approved.length - 1
          return (
            <div
              key={s.showId}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '12px 16px',
                borderBottom: isLast ? 'none' : '1px solid var(--border)',
                background: isSuccess
                  ? 'rgba(72, 187, 120, 0.03)'
                  : result && !isSuccess
                    ? 'rgba(252, 92, 101, 0.04)'
                    : 'transparent',
              }}
            >
              {/* Status icon */}
              <div style={{ marginTop: '1px', flexShrink: 0, width: '18px', textAlign: 'center' }}>
                {isPending ? (
                  <span style={{ color: 'var(--border)', fontSize: '14px' }}>○</span>
                ) : isSuccess ? (
                  <span style={{ color: 'var(--success)', fontSize: '14px' }}>✓</span>
                ) : (
                  <span style={{ color: 'var(--error)', fontSize: '14px' }}>✗</span>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: '13px', color: isPending ? 'var(--text-muted)' : 'var(--text)' }}>
                  {s.artist}
                  {s.date && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> — {s.date}</span>}
                </div>
                {result?.destinationPath && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    → {result.destinationPath}
                  </div>
                )}
                {result?.error && (
                  <div style={{ fontSize: '12px', color: 'var(--error)', marginTop: '3px' }}>
                    {result.error}
                  </div>
                )}
                {result?.success && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {result.filesProcessed} files copied
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
