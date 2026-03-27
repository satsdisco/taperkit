# TaperKit Audit — March 27, 2026

## What TaperKit Does
Live music library manager — scan messy taper/album folders, clean filenames, write proper tags, organize into Jellyfin-friendly structure (`Artist/YYYY-MM-DD Venue, City, ST/` for live, `Artist/Album Title (Year)/` for albums).

## Architecture
- **Frontend:** React + Vite + Tailwind (dark theme, ~3K LOC)
- **Backend:** Express + TypeScript (~2.7K LOC)
- **No database** — filesystem is the source of truth

## Current Views

### 1. Show Editor (single folder)
- Pick a folder → scan → edit metadata → preview rename → apply
- Components: FolderPicker, ShowEditor, TrackTable, PreviewPane, ArtworkPicker

### 2. Library Scanner (batch)
- Scan multiple source folders → review all shows → approve → batch apply
- Components: Library (934 LOC — massive), SuggestionPanel, BatchProgress

## Bugs Found During Audit

### Critical
1. ~~Scanner misses folders with audio + non-audio subdirs~~ ✅ FIXED
2. ~~Multi-disc albums (CD 01, CD 02) scanned as separate entries~~ ✅ FIXED
3. ~~MusicBrainz lookup overwrites correct artist~~ ✅ FIXED
4. ~~Dot-separated dates (1969.07.26) not parsed~~ ✅ FIXED
5. ~~En-dash track separators (01 – Title) not handled~~ ✅ FIXED
6. ~~.taperkit-trash scanned as source~~ ✅ FIXED

### Remaining Issues
7. **Ramones `[01]` track format** — square bracket track numbers like `[01]  Ramones - Rockaway Beach.mp3` not cleaned
8. **Artist prefix in filenames** — `01. Curtis Mayfield - Mighty Mighty.mp3` still has artist prefix in proposed name
9. **Track title cleanup could be smarter** — CamelCase titles (Mississippi_HalfStep) need word boundary handling
10. **No error recovery** — if apply fails mid-batch, no way to retry individual items
11. **Scan doesn't detect "no artist" reliably** — "At Folsom Prison" has no artist in folder name, relies on tags
12. **Quality markers inconsistent** — some like `[CD V0]` stripped, some like `- V0` weren't (now fixed), but edge cases remain

## UI/UX Issues

### Navigation & Layout
- **Two separate views** (Show Editor + Library) are confusing — most users will only use Library
- **Show Editor is the landing page** but Library Scanner is the power feature
- **No way to go from Library → single show edit** (they're separate flows)
- **Header nav is minimal** — no breadcrumbs, no status indicators

### Library Scanner UX
- **Library.tsx is 934 LOC** — needs breaking up
- **Filter tabs are crowded** — 6 tabs on one row, hard to scan
- **No search/filter by artist** — crucial when you have 100+ shows
- **Summary cards use 5 columns** but only 4 fit on most screens
- **Approved queue** is tiny pills that are hard to read/manage
- **No sort options** — can't sort by artist, date, health score
- **Mass approve is hidden** — no clear "approve all ready" workflow

### SuggestionPanel UX
- **Modal overlay blocks the list** — can't compare while reviewing
- **MusicBrainz lookup is manual click** — should auto-search for albums
- **No undo after approve** (actually there is via the X, but not obvious)
- **Artwork picker is separate modal on top of modal** — confusing layers

### Batch Apply UX
- **Progress is just a list** — no percentage, no ETA
- **Post-apply cleanup prompt is easy to miss**
- **No "apply and clean" single button**

### Missing Features
- **Artist search/filter** in library view
- **Sort by** artist name, date, health score, file count
- **Drag & drop** folder onto the app
- **Settings/preferences** (default source/dest, auto-cleanup, etc.)
- **History/log** of processed albums
- **Keyboard navigation** through show list (partially exists)

## Proposed UI/UX Overhaul

### Phase 1: Consolidate & Simplify
1. **Make Library the default view** — it's the main workflow
2. **Merge Show Editor into Library** — clicking a show in Library opens its editor inline or in a slide-out panel (not a separate view)
3. **Break up Library.tsx** — extract FilterBar, ShowList, ApprovedQueue, ScanConfig into separate components
4. **Add artist search** — text filter at top of show list
5. **Add sort controls** — artist, date, health, filecount

### Phase 2: Improve Review Flow
6. **Side panel instead of modal** for SuggestionPanel — split view, list on left, editor on right
7. **Auto MusicBrainz lookup** when opening album review
8. **Streamlined approve workflow** — approve from the list row without opening full panel
9. **Better track list** — show original → proposed side by side with diff highlighting
10. **Inline editing** of artist/date/venue directly in the list

### Phase 3: Polish
11. **Progress bar with percentage** during apply
12. **"Apply & Clean" combo button** — process + trash source in one action
13. **Toast notifications** instead of inline status messages
14. **Responsive layout** — works on smaller screens
15. **Dark/light theme toggle** (currently dark only)
16. **Drag & drop** folder support on home screen
17. **Recent/history** — shows last processed albums

## File Structure Recommendation
```
src/
  components/
    layout/
      Header.tsx
      Sidebar.tsx
    library/
      LibraryView.tsx      (main container)
      ScanConfig.tsx       (source/dest pickers)
      FilterBar.tsx        (tabs + search + sort)
      ShowList.tsx         (table/list of shows)
      ShowRow.tsx          (individual row)
      ApprovedQueue.tsx    (approval bar)
    review/
      ReviewPanel.tsx      (slide-out panel)
      MetadataEditor.tsx   (artist/date/venue fields)
      TrackList.tsx        (proposed filenames)
      ArtworkSection.tsx   (art picker + MB lookup)
    apply/
      ApplyProgress.tsx    (batch apply with progress)
      CleanupPrompt.tsx    (post-apply cleanup)
    shared/
      HealthBadge.tsx
      SearchInput.tsx
      SortControl.tsx
  hooks/
    useLibraryScan.ts
    useMusicBrainz.ts
    useArtwork.ts
  App.tsx
  types.ts
```

## Priority Order
1. Fix remaining bugs (#7-12)
2. Phase 1: Consolidate & default to Library
3. Phase 2: Side-panel review flow
4. Phase 3: Polish
