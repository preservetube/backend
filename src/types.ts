import type {
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from 'kysely'

export interface Database {
  videos: VideosTable
  reports: ReportsTable
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
  deletion_stage: 'pending_delete' | 'soft_delete' | 'deleted' | null
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