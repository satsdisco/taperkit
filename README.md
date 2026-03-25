# TaperKit

**Organize your live music collection for Jellyfin.**

TaperKit is a local web app for cleaning up taper recordings — the kind you download from nugs.net, Archive.org, or trade with other fans. It parses taper filename formats, normalizes tags, renames files consistently, and moves everything into a clean folder structure that Jellyfin understands.

---

## What it does

Most taper recordings arrive with inconsistent naming: `db091231d1_04_Gangster.flac`, `2009 - 12-31d1t04-Gangster.mp3`, `t04_Gangster.mp3` — all the same song, all named differently depending on who recorded it and which platform it came from. Jellyfin can't make sense of this without clean, consistent metadata.

TaperKit fixes that.

- **Parses dozens of taper filename formats** — nugs, Archive.org, db-prefixed, wsp-prefixed, date-first, track-first, disc subfolder structures
- **Cleans track titles** — strips `t01_`, `- 10-05d1t01`, `[V0]`, `(Live at ...)` and other cruft from embedded tags and filenames
- **Normalizes artist names** — `tDB`, `db`, `The Disco Biscuits`, `disco biscuits` all become `The Disco Biscuits`
- **Renames files** to a consistent format: `d1-01 Hot Air Balloon.flac`
- **Writes clean tags** — ARTIST, ALBUM, TITLE, TRACKNUMBER, DISCNUMBER, DATE — so Jellyfin groups shows correctly
- **Copies cover art** from source folders to destination
- **MusicBrainz + iTunes lookup** for official albums — fills in album title, year, and 600×600 artwork automatically
- **Library mode** — scan an entire "To Clean" folder, score each show's health, review and batch-apply in one pass

---

## Stack

- **Backend:** Node.js + Express + TypeScript (`tsx`)
- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Tag writing:** `metaflac` (FLAC) + `id3v2` (MP3)
- **Metadata:** `music-metadata` npm package for reading existing tags

---

## Requirements

```bash
brew install flac id3v2   # for tag writing
```

Node.js 18+ required.

---

## Install & Run

```bash
git clone https://github.com/satsdisco/taperkit.git
cd taperkit
npm install
npm start
```

That's it. `npm start` builds the frontend and starts the server. Your browser opens automatically at [http://localhost:7337](http://localhost:7337).

### Development mode

If you're hacking on the code, run dev mode instead — hot reload on both frontend and backend:

```bash
npm run dev
```

Frontend at `localhost:5173`, API at `localhost:7337`.

---

## Usage

### Single show (Show Editor tab)

1. Click **Browse** or paste a folder path
2. TaperKit parses the folder name and existing tags to fill in show info
3. Review and edit: artist, date, venue, city/state, source type
4. Preview the proposed renames
5. Click **Apply** — files are renamed, moved to your output directory, and tagged

### Batch processing (Library tab)

1. Add your "To Clean" folder as a source
2. Set your destination (e.g. `/Volumes/External/New Music Library`)
3. Click **Scan** — TaperKit finds all shows, scores their tag health, and flags duplicates
4. Filter by **Needs Attention** / **Ready** / **Done**
5. Click a show to review, edit, and approve — or **Mass Approve** everything ready

### Album mode

Switch any show from **Live** to **Album** in the review panel. TaperKit switches to `01 Track.mp3` naming instead of `d1-01 Track.flac`. Hit **Lookup MusicBrainz** to auto-fill the correct album title, year, artist spelling, and cover art from iTunes.

---

## Supported filename formats

| Format | Example |
|--------|---------|
| taper prefix + date + disc/track | `db091231d1_04_Gangster.flac` |
| YYYY-MM-DD date + disc/track | `2009-12-31d1t04-Gangster.flac` |
| YYYY - MM-DD (nugs style) | `2009 - 12-31d1t04-Gangster.mp3` |
| nugs tNN_ track prefix | `t04_Gangster.mp3` |
| Standard `01 - Title` | `04 - Gangster.flac` |
| Disc subfolder + track | `d1/04 Gangster.flac` |
| d1-01 already clean | `d1-04 Gangster.flac` |

---

## Output structure

```
New Music Library/
  The Disco Biscuits/
    2009-12-31 Nokia Theatre New York, NY/
      d1-01 Banter.flac
      d1-02 MEMPHIS.flac
      ...
  My Morning Jacket/
    Okonokos (2006)/
      01 Phone Went West.mp3
      02 Mahgeetah.mp3
      ...
```

---

## Limitations

- Tag writing requires `metaflac` (FLAC) and `id3v2` (MP3) — install via Homebrew
- WAV, AAC, M4A, OGG files are renamed but not retagged
- Artwork is copied as `cover.jpg` but not embedded into audio files (Jellyfin reads folder art fine)
- MusicBrainz lookup uses the public API — rate limited, no auth required

---

## License

MIT
