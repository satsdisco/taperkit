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

export type ReleaseType = 'live' | 'album'

export interface ShowInfo {
  folderPath: string
  releaseType: ReleaseType
  artist: string
  // Live show fields
  date: string
  venue: string
  city: string
  state: string
  source: string
  notes: string
  // Official album fields
  albumTitle: string
  year: string
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

// --- Library Scanner Types ---

export interface LibraryFile {
  filePath: string
  filename: string
  ext: string
  existingTags: {
    artist?: string
    album?: string
    title?: string
    date?: string
    tracknumber?: string
    discnumber?: string
    comment?: string
  }
}

export interface LibraryShow {
  id: string
  folderPath: string
  sourcePath: string
  artist: string
  date: string
  venue: string
  city: string
  state: string
  healthScore: number
  healthIssues: string[]
  fileCount: number
  hasFlac: boolean
  hasMp3: boolean
  tagStatus: 'full' | 'partial' | 'none'
  albumTitle?: string
  year?: string
  releaseType?: ReleaseType
  alreadyDone: boolean
  destinationPath?: string
  files: LibraryFile[]
}

export interface DuplicateShow extends LibraryShow {
  isWinner: boolean
  winnerReason: string
}

export interface DuplicateGroup {
  key: string
  shows: DuplicateShow[]
}

export interface LibraryShowSuggestion {
  showId: string
  originalShow: LibraryShow
  releaseType: 'live' | 'album'
  artist: string
  date: string
  venue: string
  city: string
  state: string
  source: string
  albumTitle: string
  year: string
  proposedFolderName: string
  proposedFiles: Array<{ originalFilename: string; proposedFilename: string }>
}

export interface BatchApplyResult {
  showId: string
  success: boolean
  destinationPath?: string
  error?: string
  filesProcessed: number
}
