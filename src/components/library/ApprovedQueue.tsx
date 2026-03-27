import React from 'react'
import { LibraryShowSuggestion } from '../../types'

interface Props {
  approvedSuggestions: LibraryShowSuggestion[]
  onRemove: (showId: string) => void
  onApply: () => void
  onApplyAndClean: () => void
}

export default function ApprovedQueue({ approvedSuggestions, onRemove, onApply, onApplyAndClean }: Props) {
  if (approvedSuggestions.length === 0) return null

  return (
    <div
      style={{
        background: 'rgba(72, 187, 120, 0.07)',
        border: '1px solid rgba(72, 187, 120, 0.3)',
        borderRadius: '10px',
        padding: '14px 16px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontSize: '16px' }}>✓</span>
        <span style={{ fontWeight: 700, color: 'var(--success)', fontSize: '14px' }}>
          {approvedSuggestions.length} approved
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '6px', flexWrap: 'wrap', minWidth: 0 }}>
        {approvedSuggestions.slice(0, 8).map(s => (
          <span
            key={s.showId}
            style={{
              fontSize: '11px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '20px',
              padding: '3px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap',
              color: 'var(--text)',
            }}
          >
            {s.artist} {s.date}
            <button
              onClick={() => onRemove(s.showId)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0 0 0 2px',
                fontSize: '13px',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </span>
        ))}
        {approvedSuggestions.length > 8 && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', alignSelf: 'center' }}>
            +{approvedSuggestions.length - 8} more
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button className="btn-primary" style={{ borderRadius: '6px' }} onClick={onApply}>
          Apply {approvedSuggestions.length} shows →
        </button>
        <button
          className="btn-secondary"
          onClick={onApplyAndClean}
          title="Apply then automatically trash source folders"
          style={{ fontSize: '13px', borderRadius: '6px' }}
        >
          Apply & Clean
        </button>
      </div>
    </div>
  )
}
