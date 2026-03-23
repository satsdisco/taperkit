import React, { useState, useRef, useCallback } from 'react'
import { TrackInfo } from '../types'

interface TrackTableProps {
  tracks: TrackInfo[]
  onTracksChange: (tracks: TrackInfo[]) => void
}

interface InlineInputProps {
  value: string | number
  onChange: (val: string) => void
  type?: 'text' | 'number'
  style?: React.CSSProperties
  onKeyDown?: (e: React.KeyboardEvent) => void
  inputRef?: React.RefObject<HTMLInputElement>
}

function InlineInput({ value, onChange, type = 'text', style, onKeyDown, inputRef }: InlineInputProps) {
  return (
    <input
      ref={inputRef}
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="inline-edit"
      style={{ fontFamily: type === 'number' ? 'monospace' : 'inherit', ...style }}
      onKeyDown={onKeyDown}
    />
  )
}

function TagStatusDot({ status }: { status: TrackInfo['tagStatus'] }) {
  const colors = {
    full: 'var(--success)',
    partial: 'var(--warning)',
    none: 'var(--error)',
  }
  const labels = {
    full: 'Tags complete',
    partial: 'Partial tags',
    none: 'No tags',
  }
  return (
    <span
      title={labels[status]}
      style={{
        display: 'inline-block',
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        backgroundColor: colors[status],
        flexShrink: 0,
      }}
    />
  )
}

export default function TrackTable({ tracks, onTracksChange }: TrackTableProps) {
  const updateTrack = useCallback(
    (idx: number, field: keyof TrackInfo, value: string | number) => {
      const updated = tracks.map((t, i) =>
        i === idx ? { ...t, [field]: field === 'disc' || field === 'track' ? Number(value) : value } : t
      )
      onTracksChange(updated)
    },
    [tracks, onTracksChange]
  )

  // Group tracks by disc
  const discGroups = tracks.reduce<Record<number, Array<{ track: TrackInfo; idx: number }>>>(
    (acc, track, idx) => {
      const disc = track.disc
      if (!acc[disc]) acc[disc] = []
      acc[disc].push({ track, idx })
      return acc
    },
    {}
  )
  const discNumbers = Object.keys(discGroups)
    .map(Number)
    .sort((a, b) => a - b)

  if (tracks.length === 0) {
    return (
      <div
        style={{
          padding: '40px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          backgroundColor: 'var(--surface)',
          borderRadius: '6px',
          border: '1px solid var(--border)',
        }}
      >
        No audio files found in this folder.
      </div>
    )
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      {/* Table header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '54px 54px 1fr 1fr 36px',
          gap: '0',
          backgroundColor: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
          padding: '0 12px',
        }}
      >
        {['Disc', 'Track', 'Filename', 'Title', ''].map((col, i) => (
          <div
            key={i}
            style={{
              padding: '8px 6px',
              color: 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {col}
          </div>
        ))}
      </div>

      {/* Disc groups */}
      {discNumbers.map(disc => (
        <div key={disc}>
          {/* Disc header row */}
          {discNumbers.length > 1 && (
            <div
              style={{
                padding: '6px 18px',
                backgroundColor: 'rgba(255, 140, 66, 0.06)',
                borderTop: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                color: 'var(--accent)',
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}
            >
              Disc {disc}
            </div>
          )}

          {/* Track rows */}
          {discGroups[disc].map(({ track, idx }, rowIdx) => (
            <div
              key={track.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '54px 54px 1fr 1fr 36px',
                gap: '0',
                padding: '2px 12px',
                borderBottom:
                  rowIdx < discGroups[disc].length - 1 ? '1px solid rgba(51,51,51,0.5)' : 'none',
                alignItems: 'center',
                minHeight: '36px',
              }}
              onMouseEnter={e =>
                (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)')
              }
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {/* Disc # */}
              <div>
                <InlineInput
                  value={track.disc}
                  type="number"
                  onChange={val => updateTrack(idx, 'disc', val)}
                  style={{ width: '42px', textAlign: 'center' }}
                />
              </div>

              {/* Track # */}
              <div>
                <InlineInput
                  value={track.track}
                  type="number"
                  onChange={val => updateTrack(idx, 'track', val)}
                  style={{ width: '42px', textAlign: 'center' }}
                />
              </div>

              {/* Current filename */}
              <div
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  paddingRight: '12px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={track.filename}
              >
                {track.subFolder && (
                  <span style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                    {track.subFolder}/
                  </span>
                )}
                {track.filename}
              </div>

              {/* Title */}
              <div>
                <InlineInput
                  value={track.title}
                  onChange={val => updateTrack(idx, 'title', val)}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Tag status */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <TagStatusDot status={track.tagStatus} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
