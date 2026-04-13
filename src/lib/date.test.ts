import { describe, expect, it, vi } from 'vitest'
import { getCountdownLabel, getRelativeTone, sortEntriesByDate } from './date'
import type { AppEntry } from '../types'

const baseEntries: AppEntry[] = [
  {
    id: 'b',
    title: 'Beta',
    notes: '',
    scheduledDate: '2026-04-15',
    status: 'pending',
    type: 'task',
    seriesId: null,
    recurrence: 'none',
    sortOrder: 2,
    syncState: 'synced',
    createdAt: '2026-04-01T10:00:00.000Z',
  },
  {
    id: 'a',
    title: 'Alpha',
    notes: '',
    scheduledDate: '2026-04-15',
    status: 'pending',
    type: 'task',
    seriesId: null,
    recurrence: 'none',
    sortOrder: 1,
    syncState: 'synced',
    createdAt: '2026-04-01T09:00:00.000Z',
  },
  {
    id: 'c',
    title: 'Gamma',
    notes: '',
    scheduledDate: '2026-04-14',
    status: 'pending',
    type: 'task',
    seriesId: null,
    recurrence: 'none',
    sortOrder: 0,
    syncState: 'synced',
    createdAt: '2026-04-01T08:00:00.000Z',
  },
]

describe('date helpers', () => {
  it('returns today label', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-13T10:00:00.000Z'))
    expect(getCountdownLabel('2026-04-13')).toBe('Bugün')
    vi.useRealTimers()
  })

  it('returns upcoming and past tones', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-13T10:00:00.000Z'))
    expect(getRelativeTone('2026-04-14')).toBe('upcoming')
    expect(getRelativeTone('2026-04-12')).toBe('past')
    vi.useRealTimers()
  })

  it('sorts by date then sort order then creation time', () => {
    expect(sortEntriesByDate(baseEntries).map((entry) => entry.id)).toEqual(['c', 'a', 'b'])
  })
})
