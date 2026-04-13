import { differenceInCalendarDays, isPast, isToday, parseISO } from 'date-fns'
import type { AppEntry } from '../types'

export function getCountdownLabel(dateString: string) {
  const date = parseISO(dateString)
  const today = new Date()
  const diff = differenceInCalendarDays(date, today)

  if (isToday(date)) return 'Bugün'
  if (diff > 0) return `${diff} gün kaldı`
  return `${Math.abs(diff)} gün önce`
}

export function getRelativeTone(dateString: string) {
  const date = parseISO(dateString)
  if (isToday(date)) return 'today'
  if (isPast(date)) return 'past'
  return 'upcoming'
}

export function sortEntriesByDate(entries: AppEntry[]) {
  return [...entries].sort((left, right) => {
    if (left.scheduledDate === right.scheduledDate) {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder
      }
      return left.createdAt.localeCompare(right.createdAt)
    }

    return left.scheduledDate.localeCompare(right.scheduledDate)
  })
}
