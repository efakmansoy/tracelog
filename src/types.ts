export type EntryStatus = 'pending' | 'completed' | 'canceled'
export type EntryType = 'task' | 'stage'
export type EntryRecurrence = 'none' | 'daily' | 'weekly' | 'monthly'
export type SyncState = 'synced' | 'queued'

export interface AppSeries {
  id: string
  title: string
  notes: string
  siteUrl: string
  briefUrl: string
  createdAt: string
}

export interface AppEntry {
  id: string
  title: string
  notes: string
  scheduledDate: string
  status: EntryStatus
  type: EntryType
  seriesId: string | null
  recurrence: EntryRecurrence
  sortOrder: number
  syncState: SyncState
  createdAt: string
}

export interface DashboardSettings {
  dailySummaryTime: string
  pushEnabled: boolean
  timezone: string
  displayName: string
}

export interface EntryDraft {
  title: string
  scheduledDate: string
  notes: string
  recurrence: EntryRecurrence
}

export type SeriesStageDraft = EntryDraft

export interface SeriesDraft {
  title: string
  notes: string
  siteUrl: string
  briefUrl: string
  stages: SeriesStageDraft[]
}

export type TimelineGroup =
  | {
      kind: 'single'
      nextDate: string
      entry: AppEntry
    }
  | {
      kind: 'series'
      nextDate: string
      series: AppSeries
      entries: AppEntry[]
    }
