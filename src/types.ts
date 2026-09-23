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
  restore_requests: RestoreRequestsTable
  archive_requests: ArchiveRequestsTable
  auto_approve_senders: AutoApproveSendersTable
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
  target: string[]
  title: string
  details: string
  date: Date
  pdf_url?: string | null
  hidden?: boolean
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

export interface RestoreRequestsTable {
  uuid: Generated<string>
  videoId: string
  requester_email: string
  status: 'requested' | 'restoring' | 'restored' | 'reuploading' | 'reuploaded' | 'failed'
  aws_restore_requested_at: Date | null
  aws_restore_expiry: Date | null
  error_message: string | null
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export type RestoreRequest = Selectable<RestoreRequestsTable>
export type NewRestoreRequest = Insertable<RestoreRequestsTable>
export type UpdateRestoreRequest = Updateable<RestoreRequestsTable>

export interface ArchiveRequestVideo {
  id: string
  title: string | null
  channel: string | null
  channelId: string | null
  lengthSeconds: number | null
  isArchived: boolean
  alive: boolean
  result?: { success: boolean, message: string }
}

export interface ArchiveRequestsTable {
  uuid: Generated<string>
  message_id: string
  from_email: string
  from_name: string | null
  subject: string | null
  body: string | null
  videos: ArchiveRequestVideo[]
  ai_summary: string | null
  status: Generated<'pending' | 'awaiting_context' | 'approved' | 'archiving' | 'solved' | 'dismissed' | 'failed'>
  auto_approved: Generated<boolean>
  context_message_id: string | null
  error_message: string | null
  reply_text: string | null
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export type ArchiveRequest = Selectable<ArchiveRequestsTable>
export type NewArchiveRequest = Insertable<ArchiveRequestsTable>
export type UpdateArchiveRequest = Updateable<ArchiveRequestsTable>

export interface AutoApproveSendersTable {
  email: string
  note: string | null
  created_at: Generated<Date>
}
