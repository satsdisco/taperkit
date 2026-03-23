export interface TrackInfo {
  id: string
  filePath: string
  filename: string
  disc: number
  track: number
  title: string
  existingTags: {
    artist?: string
    album?: string
    title?: string
    date?: string
    tracknumber?: string
    discnumber?: string
    comment?: string
  }
  tagStatus: 'full' | 'partial' | 'none'
  subFolder?: string
}

export interface ShowInfo {
  folderPath: string
  artist: string
  date: string
  venue: string
  city: string
  state: string
  source: string
  notes: string
  tracks: TrackInfo[]
}

export interface ApplyResult {
  results: Array<{
    filePath: string
    targetFilePath: string
    renamed: boolean
    tagged: boolean
    errors: string[]
  }>
  tools: {
    metaflac: boolean
    id3v2: boolean
  }
}

export interface PreviewEntry {
  sourceFilePath: string
  targetFilePath: string
}
