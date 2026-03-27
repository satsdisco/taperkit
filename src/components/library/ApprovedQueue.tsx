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
      <span style={{ fontWeight: 600, color: 'var(--success)', flexShrink: 0 }}>
        {approvedSuggestions.length} approved
      </span>

      <div style={{ flex: 1, display: 'flex', gap: '6px', flexWrap: 'wrap', minWidth: 0 }}>
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
              whiteSpace: 'nowrap',
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
                fontSize: '12px',
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
        <button className="btn-primary" onClick={onApply}>
          Apply {approvedSuggestions.length} shows →
        </button>
        <button
          className="btn-secondary"
          onClick={onApplyAndClean}
          title="Apply then automatically trash source folders"
          style={{ fontSize: '13px' }}
        >
          Apply & Clean
        </button>
      </div>
    </div>
  )
}
