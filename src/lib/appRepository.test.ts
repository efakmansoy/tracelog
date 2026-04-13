import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({
  hasSupabaseConfig: false,
  supabase: null,
}))

describe('appRepository local mode', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('boots in local mode and returns seed data', async () => {
    const { getBootstrapData } = await import('./appRepository')

    const data = await getBootstrapData()

    expect(data.mode).toBe('local')
    expect(data.entries.length).toBeGreaterThan(0)
    expect(data.series.length).toBeGreaterThan(0)
  })

  it('creates local task with recurrence', async () => {
    const { createTask, getBootstrapData } = await import('./appRepository')

    await createTask({
      title: 'Tekrar eden görev',
      scheduledDate: '2026-04-20',
      notes: 'test',
      recurrence: 'weekly',
    })

    const data = await getBootstrapData()
    const task = data.entries.find((entry) => entry.title === 'Tekrar eden görev')
    expect(task?.recurrence).toBe('weekly')
  })

  it('creates series with ordered stage rows', async () => {
    const { createSeries, getBootstrapData } = await import('./appRepository')

    await createSeries({
      title: 'Yeni Seri',
      notes: '',
      siteUrl: '',
      briefUrl: '',
      stages: [
        { title: 'Bir', scheduledDate: '2026-05-01', notes: '', recurrence: 'none' },
        { title: 'Iki', scheduledDate: '2026-05-02', notes: '', recurrence: 'none' },
      ],
    })

    const data = await getBootstrapData()
    const series = data.series.find((item) => item.title === 'Yeni Seri')
    const stages = data.entries.filter((entry) => entry.seriesId === series?.id)

    expect(stages.map((entry) => entry.sortOrder)).toEqual([0, 1])
  })

  it('creates next recurring task when local recurring task is completed', async () => {
    const { createTask, getBootstrapData, updateEntryStatus } = await import('./appRepository')

    await createTask({
      title: 'Günlük görev',
      scheduledDate: '2026-04-20',
      notes: '',
      recurrence: 'daily',
    })

    const firstData = await getBootstrapData()
    const task = firstData.entries.find((entry) => entry.title === 'Günlük görev' && entry.scheduledDate === '2026-04-20')
    expect(task).toBeTruthy()

    await updateEntryStatus(task!.id, 'completed')

    const nextData = await getBootstrapData()
    expect(
      nextData.entries.some(
        (entry) => entry.title === 'Günlük görev' && entry.scheduledDate === '2026-04-21' && entry.status === 'pending',
      ),
    ).toBe(true)
  })

  it('deletes series and its stages locally', async () => {
    const { createSeries, getBootstrapData, deleteSeries } = await import('./appRepository')

    await createSeries({
      title: 'Silinecek Seri',
      notes: '',
      siteUrl: '',
      briefUrl: '',
      stages: [{ title: 'Aşama', scheduledDate: '2026-06-01', notes: '', recurrence: 'none' }],
    })

    const data = await getBootstrapData()
    const series = data.series.find((item) => item.title === 'Silinecek Seri')
    expect(series).toBeTruthy()

    await deleteSeries(series!.id)

    const afterDelete = await getBootstrapData()
    expect(afterDelete.series.some((item) => item.id === series!.id)).toBe(false)
    expect(afterDelete.entries.some((entry) => entry.seriesId === series!.id)).toBe(false)
  })

  it('reorders series stages locally', async () => {
    const { createSeries, getBootstrapData, reorderSeriesStages } = await import('./appRepository')

    await createSeries({
      title: 'Sıralı Seri',
      notes: '',
      siteUrl: '',
      briefUrl: '',
      stages: [
        { title: 'İlk', scheduledDate: '2026-06-01', notes: '', recurrence: 'none' },
        { title: 'İkinci', scheduledDate: '2026-06-02', notes: '', recurrence: 'none' },
      ],
    })

    const data = await getBootstrapData()
    const series = data.series.find((item) => item.title === 'Sıralı Seri')!
    const stages = data.entries.filter((entry) => entry.seriesId === series.id)

    await reorderSeriesStages(series.id, [stages[1].id, stages[0].id])

    const reordered = await getBootstrapData()
    const nextStages = reordered.entries
      .filter((entry) => entry.seriesId === series.id)
      .sort((left, right) => left.sortOrder - right.sortOrder)

    expect(nextStages.map((entry) => entry.title)).toEqual(['İkinci', 'İlk'])
  })
})
