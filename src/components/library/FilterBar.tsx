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

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: `Pending (${shows.filter(s => !s.alreadyDone).length})` },
    { id: 'attention', label: `Needs Attention (${needsAttentionCount})` },
    { id: 'duplicates', label: `Duplicates (${dupeShowCount})` },
    { id: 'ready', label: `Ready (${readyCount})` },
    { id: 'in-library', label: `📁 In Library (${inLibraryCount})` },
    { id: 'done', label: `✅ Done (${doneCount})` },
  ]

  return (
    <div>
      {/* Mass approve + sort + search row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            onClick={onMassApprove}
            disabled={filteredUnapprovedCount === 0}
            style={{ fontSize: '12px', padding: '4px 12px' }}
          >
            ✓ Approve All Visible ({filteredUnapprovedCount})
          </button>

          {/* Artist search */}
          <input
            value={artistSearch}
            onChange={e => onArtistSearchChange(e.target.value)}
            placeholder="Filter by artist..."
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '4px 10px',
              color: 'var(--text)',
              fontSize: '12px',
              width: '180px',
            }}
          />

          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={e => onSortByChange(e.target.value as SortBy)}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '4px 10px',
              color: 'var(--text)',
              fontSize: '12px',
            }}
          >
            <option value="artist-az">Artist (A–Z)</option>
            <option value="date-newest">Date (newest first)</option>
            <option value="date-oldest">Date (oldest first)</option>
            <option value="health">Health Score</option>
            <option value="file-count">File Count</option>
          </select>
        </div>

        <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '12px', flexShrink: 0 }}>
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
          flexWrap: 'wrap',
        }}
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onFilterChange(tab.id)}
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
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}
