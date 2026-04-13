import { describe, expect, it } from 'vitest'
import { deriveDashboardData } from './dashboard'
import type { AppEntry, AppSeries } from '../types'

const entries: AppEntry[] = [
  {
    id: '1',
    title: 'Yaklasan gorev',
    notes: '',
    scheduledDate: '2099-01-02',
    status: 'pending',
    type: 'task',
    seriesId: null,
    recurrence: 'none',
    sortOrder: 1,
    syncState: 'synced',
    createdAt: '2026-01-01T09:00:00.000Z',
  },
  {
    id: '2',
    title: 'Gecmis gorev',
    notes: '',
    scheduledDate: '2026-01-01',
    status: 'pending',
    type: 'task',
    seriesId: null,
    recurrence: 'none',
    sortOrder: 0,
    syncState: 'synced',
    createdAt: '2026-01-01T09:00:00.000Z',
  },
  {
    id: '3',
    title: 'Yarisma asamasi',
    notes: '',
    scheduledDate: '2099-01-01',
    status: 'pending',
    type: 'stage',
    seriesId: 'series-1',
    recurrence: 'none',
    sortOrder: 0,
    syncState: 'synced',
    createdAt: '2026-01-01T09:00:00.000Z',
  },
  {
    id: '4',
    title: 'Tamamlanmis',
    notes: '',
    scheduledDate: '2099-02-01',
    status: 'completed',
    type: 'task',
    seriesId: null,
    recurrence: 'none',
    sortOrder: 2,
    syncState: 'synced',
    createdAt: '2026-01-01T09:00:00.000Z',
  },
]

const series: AppSeries[] = [
  {
    id: 'series-1',
    title: 'Hackathon',
    notes: '',
    siteUrl: '',
    briefUrl: '',
    createdAt: '2026-01-01T09:00:00.000Z',
  },
]

describe('deriveDashboardData', () => {
  it('separates active and archived entries correctly', () => {
    const result = deriveDashboardData(entries, series)

    expect(result.activeEntries.map((entry) => entry.id)).toEqual(['3', '1'])
    expect(result.archivedEntries.map((entry) => entry.id)).toEqual(['2', '4'])
    expect(result.todayCount).toBe(0)
    expect(result.upcoming?.id).toBe('3')
    expect(result.seriesMap.get('series-1')?.title).toBe('Hackathon')
  })
})
