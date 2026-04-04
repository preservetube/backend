import type {
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from 'kysely'

export interface Database {
  videos: VideosTable
  reports: ReportsTable
  files: FilesTable
}

export interface VideosTable {
  uuid: Generated<string>
  id: string
  title: string
  description: string
  thumbnail: string
  source: string
  published: string
  archived: string
  channel: string
  channelId: string
  channelVerified: boolean
  channelAvatar: string
  playlist?: string | null
  disabled: boolean
  hasBeenReported: boolean,
  deletion_stage: 'pending_delete' | 'soft_delete' | 'cold_storage' | 'deleted' | null
}

export type Video = Selectable<VideosTable>
export type NewVideo = Insertable<VideosTable>
export type UpdateVideo = Updateable<VideosTable>

export interface ReportsTable {
  uuid: Generated<string>
  target: string
  title: string
  details: string
  date: Date
}

export type Report = Selectable<ReportsTable>
export type NewReport = Insertable<ReportsTable>
export type UpdateReport = Updateable<ReportsTable>

export interface FilesTable {
  uuid: Generated<string>
  videoId: string
  filename: string
  hash: string
  hash_algorithm: string
  size_bytes: number
  duration_seconds: number
  video_codec: string
  audio_codec: string
  resolution: string
  fps: number
}

export type File = Selectable<FilesTable>
export type NewFile = Insertable<FilesTable>
