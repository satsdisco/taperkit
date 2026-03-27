import React from 'react'
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
                onQuickApprove={onQuickApprove}
                isQuickApproving={quickApprovingIds.has(s.id)}
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
            onQuickApprove={onQuickApprove}
            isQuickApproving={quickApprovingIds.has(s.id)}
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
}

function ShowRow({ show, dupInfo, isApproved, isSkipped, onReview, onQuickApprove, isQuickApproving }: ShowRowProps) {
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
          {show.alreadyDone && (
            <span
              title={show.destinationPath ? `In library: ${show.destinationPath}` : 'Already in library'}
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '10px',
                background: 'rgba(33,150,243,0.15)',
                color: '#2196f3',
                border: '1px solid rgba(33,150,243,0.3)',
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
                padding: '1px 6px',
                borderRadius: '10px',
                background: 'rgba(76,175,80,0.15)',
                color: 'var(--success)',
                border: '1px solid rgba(76,175,80,0.3)',
                fontWeight: 600,
              }}
            >
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

      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        {!show.alreadyDone && !isApproved && (
          <button
            className="btn-secondary"
            style={{ fontSize: '12px', padding: '4px 10px' }}
            disabled={isQuickApproving}
            onClick={() => onQuickApprove(show)}
            title="Approve without reviewing"
          >
            {isQuickApproving ? '…' : 'Approve'}
          </button>
        )}
        <button
          className="btn-secondary"
          style={{ fontSize: '12px', padding: '4px 10px' }}
          onClick={() => onReview(show)}
        >
          Review
        </button>
      </div>
    </div>
  )
}
