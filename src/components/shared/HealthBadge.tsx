import React from 'react'

export default function HealthBadge({ score }: { score: number }) {
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
