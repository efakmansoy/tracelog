import { v4 as uuid } from './uuid'
import { hasSupabaseConfig, supabase } from './supabase'
import type {
  AppEntry,
  AppSeries,
  DashboardSettings,
  EntryDraft,
  EntryRecurrence,
  EntryStatus,
  SeriesDraft,
  SyncState,
} from '../types'

const STORAGE_KEY = 'takip-local-store'
const OFFLINE_QUEUE_KEY = 'takip-offline-queue'
const VAPID_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY

interface LocalStoreShape {
  entries: AppEntry[]
  series: AppSeries[]
  settings: DashboardSettings
}

type QueueOperation =
  | { type: 'create_task'; entry: AppEntry }
  | { type: 'create_series'; series: AppSeries; entries: AppEntry[] }
  | { type: 'update_entry'; entryId: string; draft: EntryDraft }
  | { type: 'delete_entry'; entryId: string }
  | { type: 'update_status'; entryId: string; status: EntryStatus }
  | {
      type: 'update_series'
      seriesId: string
      updates: { title?: string; notes?: string; siteUrl?: string; briefUrl?: string }
    }
  | { type: 'delete_series'; seriesId: string }
  | { type: 'reorder_series_stages'; orderedIds: string[] }
  | { type: 'update_settings'; settings: DashboardSettings }

export interface BootstrapData {
  mode: 'local' | 'supabase'
  session: { userId: string; email?: string | null } | null
  entries: AppEntry[]
  series: AppSeries[]
  settings: DashboardSettings
  syncPendingCount: number
  isOffline: boolean
}

const defaultSettings: DashboardSettings = {
  dailySummaryTime: '09:00',
  pushEnabled: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  displayName: '',
}

const defaultSeed: LocalStoreShape = {
  settings: defaultSettings,
  series: [
    {
      id: 'series-demo',
      title: 'Yarışma Hazırlığı',
      notes: 'Başvuru ve final aşamalarını tek yerde tut.',
      siteUrl: 'https://example.com',
      briefUrl: 'https://example.com/sartname.pdf',
      createdAt: new Date().toISOString(),
    },
  ],
  entries: [
    {
      id: 'entry-demo-1',
      title: 'Portfolyo son düzenleme',
      notes: 'Teslim öncesi son kontrol.',
      scheduledDate: new Date().toISOString().slice(0, 10),
      status: 'pending',
      type: 'task',
      seriesId: null,
      recurrence: 'none',
      sortOrder: 0,
      syncState: 'synced',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'entry-demo-2',
      title: 'Ön eleme',
      notes: '',
      scheduledDate: futureDate(4),
      status: 'pending',
      type: 'stage',
      seriesId: 'series-demo',
      recurrence: 'none',
      sortOrder: 0,
      syncState: 'synced',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'entry-demo-3',
      title: 'Final sunumu',
      notes: '',
      scheduledDate: futureDate(11),
      status: 'pending',
      type: 'stage',
      seriesId: 'series-demo',
      recurrence: 'none',
      sortOrder: 1,
      syncState: 'synced',
      createdAt: new Date().toISOString(),
    },
  ],
}

function futureDate(offset: number) {
  const value = new Date()
  value.setDate(value.getDate() + offset)
  return value.toISOString().slice(0, 10)
}

export async function getBootstrapData(): Promise<BootstrapData> {
  if (!hasSupabaseConfig || !supabase) {
    const local = readLocalStore()
    return {
      mode: 'local',
      session: { userId: 'local-user', email: null },
      entries: local.entries,
      series: local.series,
      settings: local.settings,
      syncPendingCount: readOfflineQueue().length,
      isOffline: false,
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return {
      mode: 'supabase',
      session: null,
      entries: [],
      series: [],
      settings: defaultSettings,
      syncPendingCount: readOfflineQueue().length,
      isOffline: false,
    }
  }

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine

  if (isOffline) {
    const cached = readLocalStore()
    return {
      mode: 'supabase',
      session: { userId: session.user.id, email: session.user.email },
      entries: cached.entries.map((entry) => ({ ...entry, syncState: entry.syncState ?? 'queued' })),
      series: cached.series,
      settings: cached.settings,
      syncPendingCount: readOfflineQueue().length,
      isOffline: true,
    }
  }

  await flushOfflineQueue()

  const [{ data: entries, error: entriesError }, { data: series, error: seriesError }, { data: profile, error: profileError }] = await Promise.all([
    supabase
      .from('entries')
      .select('id,title,notes,scheduled_date,status,type,series_id,recurrence,sort_order,created_at')
      .order('scheduled_date', { ascending: true })
      .order('sort_order', { ascending: true }),
    supabase.from('series').select('id,title,notes,site_url,brief_url,created_at').order('created_at'),
    supabase
      .from('profiles')
      .select('daily_summary_time,push_enabled,timezone,display_name')
      .eq('user_id', session.user.id)
      .maybeSingle(),
  ])

  if (entriesError) throw entriesError
  if (seriesError) throw seriesError
  if (profileError) throw profileError

  const nextData: LocalStoreShape = {
    entries: (entries ?? []).map(mapEntryRow),
    series: (series ?? []).map(mapSeriesRow),
    settings: profile
      ? {
          dailySummaryTime: profile.daily_summary_time ?? defaultSettings.dailySummaryTime,
          pushEnabled: profile.push_enabled ?? false,
          timezone: profile.timezone ?? defaultSettings.timezone,
          displayName: profile.display_name ?? '',
        }
      : defaultSettings,
  }

  writeLocalStore(nextData)

  return {
    mode: 'supabase',
    session: { userId: session.user.id, email: session.user.email },
    entries: nextData.entries,
    series: nextData.series,
    settings: nextData.settings,
    syncPendingCount: readOfflineQueue().length,
    isOffline: false,
  }
}

export function watchAuth(onChange: () => void) {
  if (!supabase) return () => undefined

  const { data } = supabase.auth.onAuthStateChange(() => {
    void onChange()
  })

  return () => data.subscription.unsubscribe()
}

export async function signInWithMagicLink(email: string) {
  if (!supabase) {
    throw new Error('Supabase ayarlanmadığı için magic link kullanılamıyor.')
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })

  if (error) throw error
}

export async function signOut() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function createTask(draft: EntryDraft) {
  validateTaskDraft(draft)

  const entry: AppEntry = {
    id: uuid(),
    title: draft.title.trim(),
    notes: draft.notes.trim(),
    scheduledDate: draft.scheduledDate,
    status: 'pending',
    type: 'task',
    seriesId: null,
    recurrence: draft.recurrence,
    sortOrder: 0,
    syncState: getSyncState(),
    createdAt: new Date().toISOString(),
  }

  if (!supabase) {
    const local = readLocalStore()
    writeLocalStore({ ...local, entries: [entry, ...local.entries] })
    return entry
  }

  if (shouldQueueOffline()) {
    const local = readLocalStore()
    writeLocalStore({ ...local, entries: [entry, ...local.entries] })
    queueOperation({ type: 'create_task', entry })
    return entry
  }

  const session = await requireSession()

  const { error } = await supabase.from('entries').insert({
    id: entry.id,
    user_id: session.user.id,
    title: entry.title,
    notes: entry.notes,
    scheduled_date: entry.scheduledDate,
    status: entry.status,
    type: entry.type,
    series_id: null,
    recurrence: entry.recurrence,
    sort_order: entry.sortOrder,
  })

  if (error) throw error
  return entry
}

export async function createSeries(draft: SeriesDraft) {
  const validDraft = sanitizeSeriesDraft(draft)
  const now = new Date().toISOString()
  const series: AppSeries = {
    id: uuid(),
    title: validDraft.title.trim(),
    notes: validDraft.notes.trim(),
    siteUrl: validDraft.siteUrl.trim(),
    briefUrl: validDraft.briefUrl.trim(),
    createdAt: now,
  }
  const entries: AppEntry[] = validDraft.stages.map((stage, index) => ({
    id: uuid(),
    title: stage.title.trim(),
    notes: stage.notes.trim(),
    scheduledDate: stage.scheduledDate,
    status: 'pending',
    type: 'stage',
    seriesId: series.id,
    recurrence: 'none',
    sortOrder: index,
    syncState: getSyncState(),
    createdAt: now,
  }))

  if (!supabase) {
    const local = readLocalStore()
    writeLocalStore({
      ...local,
      series: [series, ...local.series],
      entries: [...entries, ...local.entries],
    })
    return
  }

  if (shouldQueueOffline()) {
    const local = readLocalStore()
    writeLocalStore({
      ...local,
      series: [series, ...local.series],
      entries: [...entries, ...local.entries],
    })
    queueOperation({ type: 'create_series', series, entries })
    return
  }

  const session = await requireSession()

  const { error: seriesError } = await supabase.from('series').insert({
    id: series.id,
    user_id: session.user.id,
    title: series.title,
    notes: series.notes,
    site_url: series.siteUrl,
    brief_url: series.briefUrl,
    created_at: series.createdAt,
  })

  if (seriesError) throw seriesError

  const { error: entryError } = await supabase.from('entries').insert(
    entries.map((entry) => ({
      id: entry.id,
      user_id: session.user.id,
      title: entry.title,
      notes: entry.notes,
      scheduled_date: entry.scheduledDate,
      status: entry.status,
      type: entry.type,
      series_id: entry.seriesId,
      recurrence: entry.recurrence,
      sort_order: entry.sortOrder,
      created_at: entry.createdAt,
    })),
  )

  if (entryError) throw entryError
}

export async function updateEntry(entryId: string, draft: EntryDraft) {
  validateTaskDraft(draft)

  if (!supabase) {
    const local = readLocalStore()
    writeLocalStore({
      ...local,
      entries: local.entries.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              title: draft.title.trim(),
              notes: draft.notes.trim(),
              scheduledDate: draft.scheduledDate,
              recurrence: draft.recurrence,
            }
          : entry,
      ),
    })
    return
  }

  if (shouldQueueOffline()) {
    const local = readLocalStore()
    writeLocalStore({
      ...local,
      entries: local.entries.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              title: draft.title.trim(),
              notes: draft.notes.trim(),
              scheduledDate: draft.scheduledDate,
              recurrence: draft.recurrence,
              syncState: 'queued',
            }
          : entry,
      ),
    })
    queueOperation({ type: 'update_entry', entryId, draft })
    return
  }

  const { error } = await supabase
    .from('entries')
    .update({
      title: draft.title.trim(),
      notes: draft.notes.trim(),
      scheduled_date: draft.scheduledDate,
      recurrence: draft.recurrence,
    })
    .eq('id', entryId)

  if (error) throw error
}

export async function deleteEntry(entryId: string) {
  if (!supabase) {
    applyDeleteEntryLocally(entryId)
    return
  }

  if (shouldQueueOffline()) {
    applyDeleteEntryLocally(entryId)
    queueOperation({ type: 'delete_entry', entryId })
    return
  }

  await deleteEntryRemote(entryId)
}

export async function deleteSeries(seriesId: string) {
  if (!supabase) {
    applyDeleteSeriesLocally(seriesId)
    return
  }

  if (shouldQueueOffline()) {
    applyDeleteSeriesLocally(seriesId)
    queueOperation({ type: 'delete_series', seriesId })
    return
  }

  const { error: entryError } = await supabase.from('entries').delete().eq('series_id', seriesId)
  if (entryError) throw entryError

  const { error } = await supabase.from('series').delete().eq('id', seriesId)
  if (error) throw error
}

export async function updateEntryStatus(entryId: string, status: EntryStatus) {
  if (!supabase) {
    applyStatusLocally(entryId, status)
    return
  }

  if (shouldQueueOffline()) {
    applyStatusLocally(entryId, status)
    queueOperation({ type: 'update_status', entryId, status })
    return
  }

  const { error } = await supabase.from('entries').update({ status }).eq('id', entryId)
  if (error) throw error

  if (status === 'completed') {
    await maybeCreateRecurringFollowUp(entryId)
  }
}

export async function updateSeries(
  seriesId: string,
  updates: { title?: string; notes?: string; siteUrl?: string; briefUrl?: string },
) {
  if (!supabase) {
    applySeriesUpdateLocally(seriesId, updates)
    return
  }

  if (shouldQueueOffline()) {
    applySeriesUpdateLocally(seriesId, updates)
    queueOperation({ type: 'update_series', seriesId, updates })
    return
  }

  const { error } = await supabase
    .from('series')
    .update({
      title: updates.title?.trim(),
      notes: updates.notes?.trim(),
      site_url: updates.siteUrl?.trim(),
      brief_url: updates.briefUrl?.trim(),
    })
    .eq('id', seriesId)

  if (error) throw error
}

export async function reorderSeriesStages(seriesId: string, orderedIds: string[]) {
  if (!supabase) {
    applyReorderLocally(seriesId, orderedIds)
    return
  }

  if (shouldQueueOffline()) {
    applyReorderLocally(seriesId, orderedIds)
    queueOperation({ type: 'reorder_series_stages', orderedIds })
    return
  }

  const updates = orderedIds.map((id, index) =>
    supabase!.from('entries').update({ sort_order: index }).eq('id', id).eq('series_id', seriesId),
  )
  const results = await Promise.all(updates)
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error
}

export async function updateSettings(settings: DashboardSettings) {
  if (!supabase) {
    const local = readLocalStore()
    writeLocalStore({ ...local, settings })
    return
  }

  if (shouldQueueOffline()) {
    const local = readLocalStore()
    writeLocalStore({ ...local, settings })
    queueOperation({ type: 'update_settings', settings })
    return
  }

  const session = await requireSession()

  const { error } = await supabase.from('profiles').upsert({
    user_id: session.user.id,
    daily_summary_time: settings.dailySummaryTime,
    push_enabled: settings.pushEnabled,
    timezone: settings.timezone,
    display_name: settings.displayName,
  })

  if (error) throw error
}

export function getPushSupport() {
  if (!('Notification' in window)) {
    return { supported: false, reason: 'Bu tarayıcı bildirim API desteği sunmuyor.' }
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: false, reason: 'Push için service worker veya push manager desteklenmiyor.' }
  }

  if (!VAPID_PUBLIC_KEY) {
    return { supported: false, reason: 'Push için VAPID public key tanımlanmamış.' }
  }

  return { supported: true, reason: '' }
}

export async function subscribeToPush() {
  const support = getPushSupport()
  if (!support.supported) throw new Error(support.reason)

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Bildirim izni verilmedi.')

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
  })

  if (!supabase) return { subscribed: true, subscription }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) throw new Error('Push kaydı için önce oturum açman gerekiyor.')

  const json = subscription.toJSON()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: session.user.id,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        user_agent: navigator.userAgent,
        revoked_at: null,
      },
      { onConflict: 'endpoint' },
    )

  if (error) throw error
  return { subscribed: true, subscription }
}

export async function verifyLocalPushDelivery() {
  const support = getPushSupport()
  if (!support.supported) throw new Error(support.reason)

  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new Error('Bildirim izni verilmedi.')
  }

  const registration = await navigator.serviceWorker.ready
  await registration.showNotification('TraceLog test bildirimi', {
    body: 'Bildirim teslimi ve uygulama içi doğrulama çalışıyor.',
    tag: 'tracelog-test',
  })
}

async function flushOfflineQueue() {
  if (!supabase || shouldQueueOffline()) return

  const queue = readOfflineQueue()
  if (queue.length === 0) return

  for (const operation of queue) {
    await replayOperation(operation)
  }

  clearOfflineQueue()
  const local = readLocalStore()
  writeLocalStore({
    ...local,
    entries: local.entries.map((entry) => ({ ...entry, syncState: 'synced' })),
  })
}

async function replayOperation(operation: QueueOperation) {
  const session = await requireSession()

  switch (operation.type) {
    case 'create_task': {
      const { error } = await supabase!.from('entries').insert({
        id: operation.entry.id,
        user_id: session.user.id,
        title: operation.entry.title,
        notes: operation.entry.notes,
        scheduled_date: operation.entry.scheduledDate,
        status: operation.entry.status,
        type: operation.entry.type,
        series_id: null,
        recurrence: operation.entry.recurrence,
        sort_order: operation.entry.sortOrder,
        created_at: operation.entry.createdAt,
      })
      if (error) throw error
      return
    }
    case 'create_series': {
      const { error: seriesError } = await supabase!.from('series').insert({
        id: operation.series.id,
        user_id: session.user.id,
        title: operation.series.title,
        notes: operation.series.notes,
        site_url: operation.series.siteUrl,
        brief_url: operation.series.briefUrl,
        created_at: operation.series.createdAt,
      })
      if (seriesError) throw seriesError

      const { error: entryError } = await supabase!.from('entries').insert(
        operation.entries.map((entry) => ({
          id: entry.id,
          user_id: session.user.id,
          title: entry.title,
          notes: entry.notes,
          scheduled_date: entry.scheduledDate,
          status: entry.status,
          type: entry.type,
          series_id: entry.seriesId,
          recurrence: entry.recurrence,
          sort_order: entry.sortOrder,
          created_at: entry.createdAt,
        })),
      )
      if (entryError) throw entryError
      return
    }
    case 'update_entry': {
      const { error } = await supabase!
        .from('entries')
        .update({
          title: operation.draft.title.trim(),
          notes: operation.draft.notes.trim(),
          scheduled_date: operation.draft.scheduledDate,
          recurrence: operation.draft.recurrence,
        })
        .eq('id', operation.entryId)
      if (error) throw error
      return
    }
    case 'delete_entry':
      await deleteEntryRemote(operation.entryId)
      return
    case 'update_status': {
      const { error } = await supabase!.from('entries').update({ status: operation.status }).eq('id', operation.entryId)
      if (error) throw error
      if (operation.status === 'completed') {
        await maybeCreateRecurringFollowUp(operation.entryId)
      }
      return
    }
    case 'update_series': {
      const { error } = await supabase!
        .from('series')
        .update({
          title: operation.updates.title?.trim(),
          notes: operation.updates.notes?.trim(),
          site_url: operation.updates.siteUrl?.trim(),
          brief_url: operation.updates.briefUrl?.trim(),
        })
        .eq('id', operation.seriesId)
      if (error) throw error
      return
    }
    case 'delete_series': {
      const { error: entriesError } = await supabase!.from('entries').delete().eq('series_id', operation.seriesId)
      if (entriesError) throw entriesError
      const { error } = await supabase!.from('series').delete().eq('id', operation.seriesId)
      if (error) throw error
      return
    }
    case 'reorder_series_stages': {
      const updates = operation.orderedIds.map((id, index) =>
        supabase!.from('entries').update({ sort_order: index }).eq('id', id),
      )
      const results = await Promise.all(updates)
      const failed = results.find((result) => result.error)
      if (failed?.error) throw failed.error
      return
    }
    case 'update_settings': {
      const { error } = await supabase!.from('profiles').upsert({
        user_id: session.user.id,
        daily_summary_time: operation.settings.dailySummaryTime,
        push_enabled: operation.settings.pushEnabled,
        timezone: operation.settings.timezone,
        display_name: operation.settings.displayName,
      })
      if (error) throw error
    }
  }
}

function sanitizeSeriesDraft(draft: SeriesDraft): SeriesDraft {
  if (!draft.title.trim()) throw new Error('Seri başlığı gerekli.')

  const stages = draft.stages.filter((stage) => stage.title.trim() && stage.scheduledDate)
  if (stages.length === 0) throw new Error('En az bir aşama eklemen gerekiyor.')

  return {
    ...draft,
    stages: stages.map((stage) => ({ ...stage, recurrence: 'none' })),
  }
}

function validateTaskDraft(draft: EntryDraft) {
  if (!draft.title.trim()) throw new Error('Görev başlığı gerekli.')
  if (!draft.scheduledDate) throw new Error('Görev tarihi gerekli.')
}

async function requireSession() {
  if (!supabase) throw new Error('Supabase bağlantısı yok.')

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) throw new Error('Bu işlem için önce oturum açman gerekiyor.')

  return session
}

async function deleteEntryRemote(entryId: string) {
  const { data: target, error: targetError } = await supabase!
    .from('entries')
    .select('series_id')
    .eq('id', entryId)
    .single()

  if (targetError) throw targetError

  const { error } = await supabase!.from('entries').delete().eq('id', entryId)
  if (error) throw error

  if (!target.series_id) return

  const { count, error: countError } = await supabase!
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .eq('series_id', target.series_id)

  if (countError) throw countError

  if (count === 0) {
    const { error: seriesError } = await supabase!.from('series').delete().eq('id', target.series_id)
    if (seriesError) throw seriesError
  }
}

function mapEntryRow(row: Record<string, string | number | null>): AppEntry {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    notes: String(row.notes ?? ''),
    scheduledDate: String(row.scheduled_date ?? ''),
    status: (row.status as EntryStatus) ?? 'pending',
    type: (row.type as AppEntry['type']) ?? 'task',
    seriesId: row.series_id ? String(row.series_id) : null,
    recurrence: (row.recurrence as EntryRecurrence) ?? 'none',
    sortOrder: Number(row.sort_order ?? 0),
    syncState: 'synced',
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

function mapSeriesRow(row: Record<string, string | null>): AppSeries {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    notes: String(row.notes ?? ''),
    siteUrl: String(row.site_url ?? ''),
    briefUrl: String(row.brief_url ?? ''),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

function applyDeleteEntryLocally(entryId: string) {
  const local = readLocalStore()
  const target = local.entries.find((entry) => entry.id === entryId)
  if (!target) return

  const nextEntries = local.entries.filter((entry) => entry.id !== entryId)
  const nextSeries =
    target.seriesId && !nextEntries.some((entry) => entry.seriesId === target.seriesId)
      ? local.series.filter((series) => series.id !== target.seriesId)
      : local.series

  writeLocalStore({ ...local, entries: nextEntries, series: nextSeries })
}

function applyDeleteSeriesLocally(seriesId: string) {
  const local = readLocalStore()
  writeLocalStore({
    ...local,
    entries: local.entries.filter((entry) => entry.seriesId !== seriesId),
    series: local.series.filter((series) => series.id !== seriesId),
  })
}

function applyStatusLocally(entryId: string, status: EntryStatus) {
  const local = readLocalStore()
  const target = local.entries.find((entry) => entry.id === entryId)
  const nextEntries = local.entries.map((entry) =>
    entry.id === entryId ? { ...entry, status, syncState: getSyncState() } : entry,
  )

  if (target && status === 'completed' && target.type === 'task' && target.recurrence !== 'none') {
    const nextDate = getNextRecurringDate(target.scheduledDate, target.recurrence)
    if (!nextEntries.some((entry) => entry.title === target.title && entry.scheduledDate === nextDate && entry.status === 'pending')) {
      nextEntries.unshift({
        ...target,
        id: uuid(),
        scheduledDate: nextDate,
        status: 'pending',
        syncState: getSyncState(),
        createdAt: new Date().toISOString(),
      })
    }
  }

  writeLocalStore({
    ...local,
    entries: nextEntries,
  })
}

async function maybeCreateRecurringFollowUp(entryId: string) {
  const { data: entry, error } = await supabase!
    .from('entries')
    .select('id,title,notes,scheduled_date,status,type,series_id,recurrence,sort_order,created_at')
    .eq('id', entryId)
    .single()

  if (error) throw error
  const mapped = mapEntryRow(entry as Record<string, string | number | null>)
  if (mapped.type !== 'task' || mapped.recurrence === 'none') return

  const nextDate = getNextRecurringDate(mapped.scheduledDate, mapped.recurrence)
  const { count, error: countError } = await supabase!
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .eq('title', mapped.title)
    .eq('scheduled_date', nextDate)
    .eq('status', 'pending')
    .is('series_id', null)

  if (countError) throw countError
  if ((count ?? 0) > 0) return

  const session = await requireSession()
  const { error: insertError } = await supabase!.from('entries').insert({
    id: uuid(),
    user_id: session.user.id,
    title: mapped.title,
    notes: mapped.notes,
    scheduled_date: nextDate,
    status: 'pending',
    type: 'task',
    series_id: null,
    recurrence: mapped.recurrence,
    sort_order: mapped.sortOrder,
  })

  if (insertError) throw insertError
}

function getNextRecurringDate(date: string, recurrence: EntryRecurrence) {
  const value = parseDateOnly(date)

  if (recurrence === 'daily') value.setDate(value.getDate() + 1)
  if (recurrence === 'weekly') value.setDate(value.getDate() + 7)
  if (recurrence === 'monthly') value.setMonth(value.getMonth() + 1)

  return formatDateOnly(value)
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDateOnly(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function applySeriesUpdateLocally(
  seriesId: string,
  updates: { title?: string; notes?: string; siteUrl?: string; briefUrl?: string },
) {
  const local = readLocalStore()
  writeLocalStore({
    ...local,
    series: local.series.map((series) =>
      series.id === seriesId
        ? {
            ...series,
            title: updates.title?.trim() ?? series.title,
            notes: updates.notes?.trim() ?? series.notes,
            siteUrl: updates.siteUrl?.trim() ?? series.siteUrl,
            briefUrl: updates.briefUrl?.trim() ?? series.briefUrl,
          }
        : series,
    ),
  })
}

function applyReorderLocally(seriesId: string, orderedIds: string[]) {
  const local = readLocalStore()
  const orderMap = new Map(orderedIds.map((id, index) => [id, index]))
  writeLocalStore({
    ...local,
    entries: local.entries.map((entry) =>
      entry.seriesId === seriesId && orderMap.has(entry.id)
        ? { ...entry, sortOrder: orderMap.get(entry.id) ?? entry.sortOrder, syncState: getSyncState() }
        : entry,
    ),
  })
}

function shouldQueueOffline() {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

function getSyncState(): SyncState {
  return shouldQueueOffline() ? 'queued' : 'synced'
}

function queueOperation(operation: QueueOperation) {
  const queue = readOfflineQueue()
  window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify([...queue, operation]))
}

function readOfflineQueue(): QueueOperation[] {
  const raw = window.localStorage.getItem(OFFLINE_QUEUE_KEY)
  if (!raw) return []

  try {
    return JSON.parse(raw) as QueueOperation[]
  } catch {
    window.localStorage.removeItem(OFFLINE_QUEUE_KEY)
    return []
  }
}

function clearOfflineQueue() {
  window.localStorage.removeItem(OFFLINE_QUEUE_KEY)
}

function readLocalStore(): LocalStoreShape {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSeed))
    return defaultSeed
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalStoreShape>
    return {
      settings: {
        ...defaultSettings,
        ...(parsed.settings ?? {}),
      },
      series: (parsed.series ?? []).map((series) => ({
        id: series.id ?? uuid(),
        title: series.title ?? '',
        notes: series.notes ?? '',
        siteUrl: series.siteUrl ?? '',
        briefUrl: series.briefUrl ?? '',
        createdAt: series.createdAt ?? new Date().toISOString(),
      })),
      entries: (parsed.entries ?? []).map((entry, index) => ({
        id: entry.id ?? uuid(),
        title: entry.title ?? '',
        notes: entry.notes ?? '',
        scheduledDate: entry.scheduledDate ?? '',
        status: entry.status ?? 'pending',
        type: entry.type ?? 'task',
        seriesId: entry.seriesId ?? null,
        recurrence: entry.recurrence ?? 'none',
        sortOrder: entry.sortOrder ?? index,
        syncState: entry.syncState ?? 'synced',
        createdAt: entry.createdAt ?? new Date().toISOString(),
      })),
    }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSeed))
    return defaultSeed
  }
}

function writeLocalStore(data: LocalStoreShape) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index)
  }

  return outputArray
}
