import React from 'react'

export default function HealthBadge({ score }: { score: number }) {
  const [label, color] =
    score >= 70
      ? ['✓', 'var(--success)']
      : score >= 40
        ? ['!', 'var(--warning)']
        : ['✗', 'var(--error)']

  return (
    <span
      title={`Health score: ${score}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: `${color}18`,
        border: `1px solid ${color}40`,
        color,
        fontSize: '12px',
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  )
}
