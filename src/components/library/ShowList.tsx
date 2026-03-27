import React, { useState } from 'react'
import { LibraryShow, DuplicateGroup } from '../../types'
import HealthBadge from '../shared/HealthBadge'

interface ShowListProps {
  shows: LibraryShow[]
  duplicateInfo: Map<string, { isWinner: boolean; winnerReason: string; groupKey: string }>
  duplicateGroups: DuplicateGroup[]
  approvedIds: Set<string>
  skippedIds: Set<string>
  onReview: (show: LibraryShow) => void
  onQuickApprove: (show: LibraryShow) => void
  quickApprovingIds: Set<string>
}

export default function ShowList({
  shows,
  duplicateInfo,
  duplicateGroups,
  approvedIds,
  skippedIds,
  onReview,
  onQuickApprove,
  quickApprovingIds,
}: ShowListProps) {
  if (duplicateGroups.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {duplicateGroups.map(group => (
          <div
            key={group.key}
            style={{
              border: '1px solid rgba(237, 137, 54, 0.3)',
              borderRadius: '12px',
              overflow: 'hidden',
              background: 'var(--surface)',
            }}
          >
            <div
              style={{
                padding: '8px 16px',
                background: 'rgba(237, 137, 54, 0.08)',
                fontSize: '11px',
                color: 'var(--warning)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>⚠</span>
              Duplicate Group — {group.shows[0].artist} {group.shows[0].date}
            </div>
            {group.shows.map((s, i) => (
              <ShowRow
                key={s.id}
                show={s}
                dupInfo={{ isWinner: s.isWinner, winnerReason: s.winnerReason, groupKey: group.key }}
                isApproved={approvedIds.has(s.id)}
                isSkipped={skippedIds.has(s.id)}
                onReview={onReview}
                onQuickApprove={onQuickApprove}
                isQuickApproving={quickApprovingIds.has(s.id)}
                isLast={i === group.shows.length - 1}
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
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      {shows.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No shows in this category.
        </div>
      ) : (
        shows.map((s, i) => (
          <ShowRow
            key={s.id}
            show={s}
            dupInfo={duplicateInfo.get(s.id)}
            isApproved={approvedIds.has(s.id)}
            isSkipped={skippedIds.has(s.id)}
            onReview={onReview}
            onQuickApprove={onQuickApprove}
            isQuickApproving={quickApprovingIds.has(s.id)}
            isLast={i === shows.length - 1}
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
  onQuickApprove: (show: LibraryShow) => void
  isQuickApproving: boolean
  isLast?: boolean
}

function ShowRow({ show, dupInfo, isApproved, isSkipped, onReview, onQuickApprove, isQuickApproving, isLast }: ShowRowProps) {
  const [hovered, setHovered] = useState(false)

  const truncatePath = (p: string) => {
    if (p.length <= 60) return p
    const parts = p.split('/')
    if (parts.length <= 3) return p
    return '.../' + parts.slice(-2).join('/')
  }

  // Build a preview of the Jellyfin folder name from current metadata
  const jellyfinPreview = [
    show.date,
    show.venue,
    [show.city, show.state].filter(Boolean).join(', '),
  ].filter(Boolean).join(' ')

  let rowBg = 'transparent'
  if (isApproved) rowBg = 'rgba(72, 187, 120, 0.04)'
  if (isSkipped) rowBg = 'rgba(0, 0, 0, 0.15)'
  if (hovered && !isSkipped) rowBg = 'rgba(108, 99, 255, 0.04)'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '12px 16px',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        background: rowBg,
        opacity: isSkipped ? 0.45 : 1,
        transition: 'background 0.1s',
        cursor: 'default',
      }}
    >
      <HealthBadge score={show.healthScore} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top line: artist + date + venue */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>
            {show.artist || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 400 }}>Unknown Artist</span>}
          </span>
          {show.date && (
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{show.date}</span>
          )}
          {show.venue && (
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {show.venue}{show.city ? `, ${show.city}` : ''}
              {show.state ? `, ${show.state}` : ''}
            </span>
          )}

          {/* Badges */}
          {dupInfo && (
            <span
              style={{
                fontSize: '10px',
                padding: '2px 8px',
                borderRadius: '10px',
                background: dupInfo.isWinner ? 'rgba(72, 187, 120, 0.12)' : 'rgba(237, 137, 54, 0.12)',
                color: dupInfo.isWinner ? 'var(--success)' : 'var(--warning)',
                border: `1px solid ${dupInfo.isWinner ? 'rgba(72, 187, 120, 0.3)' : 'rgba(237, 137, 54, 0.3)'}`,
                fontWeight: 600,
              }}
            >
              {dupInfo.isWinner ? `✓ Winner (${dupInfo.winnerReason})` : 'Duplicate'}
            </span>
          )}
          {show.alreadyDone && (
            <span
              title={show.destinationPath ? `In library: ${show.destinationPath}` : 'Already in library'}
              style={{
                fontSize: '10px',
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'rgba(108, 99, 255, 0.12)',
                color: 'var(--accent)',
                border: '1px solid rgba(108, 99, 255, 0.3)',
                fontWeight: 600,
              }}
            >
              📁 In Library
            </span>
          )}
          {isApproved && (
            <span
              style={{
                fontSize: '10px',
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'rgba(72, 187, 120, 0.12)',
                color: 'var(--success)',
                border: '1px solid rgba(72, 187, 120, 0.3)',
                fontWeight: 600,
              }}
            >
              ✓ Approved
            </span>
          )}
        </div>

        {/* Bottom line: path / file info / hover preview */}
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {hovered && jellyfinPreview ? (
            <span style={{ color: 'var(--accent)', opacity: 0.85 }}>
              📁 {show.artist}/{jellyfinPreview}/
            </span>
          ) : (
            <>
              {truncatePath(show.folderPath)}
              <span style={{ marginLeft: '8px', color: 'var(--border)', opacity: 1 }}>
                {show.fileCount} files · {show.hasFlac ? 'FLAC' : 'MP3'}
              </span>
            </>
          )}
        </div>

        {show.healthIssues.length > 0 && (
          <div style={{ fontSize: '11px', color: 'var(--warning)', marginTop: '2px' }}>
            {show.healthIssues.join(' · ')}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        {!show.alreadyDone && !isApproved && (
          <button
            className="btn-secondary"
            style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '20px' }}
            disabled={isQuickApproving}
            onClick={() => onQuickApprove(show)}
            title="Approve without reviewing"
          >
            {isQuickApproving ? '…' : '✓'}
          </button>
        )}
        <button
          className="btn-secondary"
          style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '20px' }}
          onClick={() => onReview(show)}
        >
          Review →
        </button>
      </div>
    </div>
  )
}
