import React from 'react'
import { LibraryShow, DuplicateGroup, LibraryShowSuggestion } from '../../types'

export type FilterTab = 'all' | 'attention' | 'duplicates' | 'ready' | 'done' | 'in-library'
export type SortBy = 'artist-az' | 'date-newest' | 'date-oldest' | 'health' | 'file-count'

interface Props {
  filter: FilterTab
  onFilterChange: (tab: FilterTab) => void
  shows: LibraryShow[]
  duplicateGroups: DuplicateGroup[]
  dupShowIdSet: Set<string>
  approvedSuggestions: LibraryShowSuggestion[]
  skippedIds: Set<string>
  filteredUnapprovedCount: number
  onMassApprove: () => void
  artistSearch: string
  onArtistSearchChange: (val: string) => void
  sortBy: SortBy
  onSortByChange: (sort: SortBy) => void
}

export default function FilterBar({
  filter,
  onFilterChange,
  shows,
  duplicateGroups,
  dupShowIdSet,
  approvedSuggestions,
  skippedIds,
  filteredUnapprovedCount,
  onMassApprove,
  artistSearch,
  onArtistSearchChange,
  sortBy,
  onSortByChange,
}: Props) {
  const inLibraryCount = shows.filter(s => s.alreadyDone).length
  const doneCount = shows.filter(s => s.alreadyDone).length
  const needsAttentionCount = shows.filter(s => !s.alreadyDone && s.healthScore < 70).length
  const readyCount = shows.filter(s => !s.alreadyDone && s.healthScore >= 70).length
  const dupeShowCount = shows.filter(s => !s.alreadyDone && dupShowIdSet.has(s.id)).length

  const tabs: { id: FilterTab; label: string; count: number; color?: string }[] = [
    { id: 'all', label: 'Pending', count: shows.filter(s => !s.alreadyDone).length },
    { id: 'attention', label: 'Needs Attention', count: needsAttentionCount, color: 'var(--warning)' },
    { id: 'duplicates', label: 'Duplicates', count: dupeShowCount, color: 'var(--warning)' },
    { id: 'ready', label: 'Ready', count: readyCount, color: 'var(--success)' },
    { id: 'in-library', label: 'In Library', count: inLibraryCount },
    { id: 'done', label: 'Done', count: doneCount, color: 'var(--success)' },
  ]

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Top row: search + approve + sort */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '12px',
          flexWrap: 'wrap',
        }}
      >
        {/* Search with icon */}
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '280px' }}>
          <span
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              fontSize: '14px',
              pointerEvents: 'none',
            }}
          >
            🔍
          </span>
          <input
            value={artistSearch}
            onChange={e => onArtistSearchChange(e.target.value)}
            placeholder="Search artists..."
            style={{
              width: '100%',
              paddingLeft: '32px',
              paddingRight: '10px',
              paddingTop: '7px',
              paddingBottom: '7px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '20px',
              color: 'var(--text)',
              fontSize: '13px',
            }}
          />
        </div>

        <button
          className="btn-secondary"
          onClick={onMassApprove}
          disabled={filteredUnapprovedCount === 0}
          style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '20px' }}
        >
          ✓ Approve All ({filteredUnapprovedCount})
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Sort dropdown */}
        <select
          value={sortBy}
          onChange={e => onSortByChange(e.target.value as SortBy)}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '7px 12px',
            color: 'var(--text)',
            fontSize: '12px',
          }}
        >
          <option value="artist-az">Artist A–Z</option>
          <option value="date-newest">Date: Newest</option>
          <option value="date-oldest">Date: Oldest</option>
          <option value="health">Health Score</option>
          <option value="file-count">File Count</option>
        </select>

        <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '10px', flexShrink: 0 }}>
          <span>⌘A approve</span>
          <span>← → navigate</span>
          <span>Esc close</span>
        </div>
      </div>

      {/* Filter pill tabs */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {tabs.map(tab => {
          const isActive = filter === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onFilterChange(tab.id)}
              style={{
                background: isActive ? 'rgba(108, 99, 255, 0.15)' : 'var(--surface)',
                border: isActive ? '1px solid rgba(108, 99, 255, 0.4)' : '1px solid var(--border)',
                borderRadius: '20px',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                padding: '5px 14px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: isActive ? 600 : 400,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
              <span
                style={{
                  fontSize: '11px',
                  background: isActive ? 'rgba(108, 99, 255, 0.25)' : 'var(--surface-2)',
                  color: isActive ? 'var(--accent)' : (tab.count > 0 && tab.color ? tab.color : 'var(--text-muted)'),
                  borderRadius: '10px',
                  padding: '1px 7px',
                  fontWeight: 600,
                  minWidth: '20px',
                  textAlign: 'center',
                }}
              >
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
