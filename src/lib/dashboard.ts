import { isBefore, isToday, parseISO } from 'date-fns'
import type { AppEntry, AppSeries } from '../types'
import { sortEntriesByDate } from './date'

export function deriveDashboardData(entries: AppEntry[], series: AppSeries[]) {
  const sortedEntries = sortEntriesByDate(entries)
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const activeEntries = sortedEntries.filter((entry) => {
    const date = parseISO(entry.scheduledDate)
    return entry.status === 'pending' && !isBefore(date, startOfToday)
  })
  const archivedEntries = sortedEntries.filter((entry) => !activeEntries.includes(entry))
  const upcoming = activeEntries[0] ?? null
  const todayCount = activeEntries.filter((entry) => isToday(parseISO(entry.scheduledDate))).length
  const seriesMap = new Map(series.map((item) => [item.id, item]))

  return {
    activeEntries,
    archivedEntries,
    upcoming,
    todayCount,
    activeCount: activeEntries.length,
    seriesMap,
  }
}
