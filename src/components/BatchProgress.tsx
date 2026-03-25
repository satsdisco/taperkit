import React from 'react'
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

  // Build a map for quick lookup
  const resultMap = new Map(results.map(r => [r.showId, r]))

  return (
    <div style={{ padding: '24px', maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontWeight: 600 }}>
            {done ? 'Done' : 'Applying shows...'}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            {completed} / {total}
          </span>
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
              background: done && failed === 0 ? 'var(--success)' : 'var(--accent)',
              borderRadius: '4px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {done && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '20px',
            background: failed > 0 ? 'rgba(244,67,54,0.1)' : 'rgba(76,175,80,0.1)',
            border: `1px solid ${failed > 0 ? 'var(--error)' : 'var(--success)'}`,
          }}
        >
          <span style={{ color: 'var(--success)', fontWeight: 600 }}>{succeeded} succeeded</span>
          {failed > 0 && (
            <span style={{ color: 'var(--error)', fontWeight: 600, marginLeft: '12px' }}>
              {failed} failed
            </span>
          )}
        </div>
      )}

      {/* Per-show status */}
      <div>
        {approved.map(s => {
          const result = resultMap.get(s.showId)
          const isPending = !result
          const isSuccess = result?.success
          return (
            <div
              key={s.showId}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{ marginTop: '2px', flexShrink: 0, fontSize: '14px' }}>
                {isPending ? (
                  <span style={{ color: 'var(--text-muted)' }}>○</span>
                ) : isSuccess ? (
                  <span style={{ color: 'var(--success)' }}>✓</span>
                ) : (
                  <span style={{ color: 'var(--error)' }}>✗</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>
                  {s.artist} — {s.date}
                </div>
                {result?.destinationPath && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                    → {result.destinationPath}
                  </div>
                )}
                {result?.error && (
                  <div style={{ fontSize: '12px', color: 'var(--error)', marginTop: '2px' }}>
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
