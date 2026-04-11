export type EntryStatus = 'pending' | 'completed' | 'canceled'

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
  type: 'task' | 'stage'
  seriesId: string | null
  createdAt: string
}

export interface DashboardSettings {
  dailySummaryTime: string
  pushEnabled: boolean
  timezone: string
}

export interface EntryDraft {
  title: string
  scheduledDate: string
  notes: string
}

export interface SeriesStageDraft extends EntryDraft {}

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
