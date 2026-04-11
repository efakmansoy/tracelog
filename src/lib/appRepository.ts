import { v4 as uuid } from './uuid'
import { hasSupabaseConfig, supabase } from './supabase'
import type {
  AppEntry,
  AppSeries,
  DashboardSettings,
  EntryDraft,
  EntryStatus,
  SeriesDraft,
} from '../types'

const STORAGE_KEY = 'takip-local-store'
const VAPID_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY

interface LocalStoreShape {
  entries: AppEntry[]
  series: AppSeries[]
  settings: DashboardSettings
}

export interface BootstrapData {
  mode: 'local' | 'supabase'
  session: { userId: string; email?: string | null } | null
  entries: AppEntry[]
  series: AppSeries[]
  settings: DashboardSettings
}

const defaultSettings: DashboardSettings = {
  dailySummaryTime: '09:00',
  pushEnabled: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
    }
  }

  const [{ data: entries, error: entriesError }, { data: series, error: seriesError }, { data: profile, error: profileError }] = await Promise.all([
    supabase
      .from('entries')
      .select('id,title,notes,scheduled_date,status,type,series_id,created_at')
      .order('scheduled_date', { ascending: true }),
    supabase
      .from('series')
      .select('id,title,notes,site_url,brief_url,created_at')
      .order('created_at'),
    supabase
      .from('profiles')
      .select('daily_summary_time,push_enabled,timezone')
      .eq('user_id', session.user.id)
      .maybeSingle(),
  ])

  if (entriesError) throw entriesError
  if (seriesError) throw seriesError
  if (profileError) throw profileError

  return {
    mode: 'supabase',
    session: { userId: session.user.id, email: session.user.email },
    entries: (entries ?? []).map(mapEntryRow),
    series: (series ?? []).map(mapSeriesRow),
    settings: profile
      ? {
          dailySummaryTime: profile.daily_summary_time ?? defaultSettings.dailySummaryTime,
          pushEnabled: profile.push_enabled ?? false,
          timezone: profile.timezone ?? defaultSettings.timezone,
        }
      : defaultSettings,
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
    createdAt: new Date().toISOString(),
  }

  if (!supabase) {
    const local = readLocalStore()
    writeLocalStore({ ...local, entries: [entry, ...local.entries] })
    return entry
  }

  const session = await requireSession()

  const { error } = await supabase.from('entries').insert({
    user_id: session.user.id,
    title: entry.title,
    notes: entry.notes,
    scheduled_date: entry.scheduledDate,
    status: entry.status,
    type: entry.type,
    series_id: null,
  })

  if (error) throw error
  return entry
}

export async function createSeries(draft: SeriesDraft) {
  const validDraft = sanitizeSeriesDraft(draft)

  if (!supabase) {
    const local = readLocalStore()
    const now = new Date().toISOString()
    const series: AppSeries = {
      id: uuid(),
      title: validDraft.title.trim(),
      notes: validDraft.notes.trim(),
      siteUrl: validDraft.siteUrl.trim(),
      briefUrl: validDraft.briefUrl.trim(),
      createdAt: now,
    }
    const entries: AppEntry[] = validDraft.stages.map((stage) => ({
      id: uuid(),
      title: stage.title.trim(),
      notes: stage.notes.trim(),
      scheduledDate: stage.scheduledDate,
      status: 'pending',
      type: 'stage',
      seriesId: series.id,
      createdAt: now,
    }))

    writeLocalStore({
      ...local,
      series: [series, ...local.series],
      entries: [...entries, ...local.entries],
    })
    return
  }

  const session = await requireSession()

  const { data: seriesData, error: seriesError } = await supabase
    .from('series')
    .insert({
      user_id: session.user.id,
      title: validDraft.title.trim(),
      notes: validDraft.notes.trim(),
      site_url: validDraft.siteUrl.trim(),
      brief_url: validDraft.briefUrl.trim(),
    })
    .select('id')
    .single()

  if (seriesError || !seriesData) {
    throw seriesError ?? new Error('Seri kaydedilemedi.')
  }

  const { error: entryError } = await supabase.from('entries').insert(
    validDraft.stages.map((stage) => ({
      user_id: session.user.id,
      title: stage.title.trim(),
      notes: stage.notes.trim(),
      scheduled_date: stage.scheduledDate,
      status: 'pending',
      type: 'stage',
      series_id: seriesData.id,
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
            }
          : entry,
      ),
    })
    return
  }

  const { error } = await supabase
    .from('entries')
    .update({
      title: draft.title.trim(),
      notes: draft.notes.trim(),
      scheduled_date: draft.scheduledDate,
    })
    .eq('id', entryId)

  if (error) throw error
}

export async function deleteEntry(entryId: string) {
  if (!supabase) {
    const local = readLocalStore()
    const target = local.entries.find((entry) => entry.id === entryId)
    if (!target) return

    const nextEntries = local.entries.filter((entry) => entry.id !== entryId)
    const nextSeries =
      target.seriesId && !nextEntries.some((entry) => entry.seriesId === target.seriesId)
        ? local.series.filter((series) => series.id !== target.seriesId)
        : local.series

    writeLocalStore({
      ...local,
      entries: nextEntries,
      series: nextSeries,
    })
    return
  }

  const { data: target, error: targetError } = await supabase
    .from('entries')
    .select('series_id')
    .eq('id', entryId)
    .single()

  if (targetError) throw targetError

  const { error } = await supabase.from('entries').delete().eq('id', entryId)
  if (error) throw error

  if (!target.series_id) return

  const { count, error: countError } = await supabase
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .eq('series_id', target.series_id)

  if (countError) throw countError

  if (count === 0) {
    const { error: seriesError } = await supabase
      .from('series')
      .delete()
      .eq('id', target.series_id)

    if (seriesError) throw seriesError
  }
}

export async function updateEntryStatus(entryId: string, status: EntryStatus) {
  if (!supabase) {
    const local = readLocalStore()
    writeLocalStore({
      ...local,
      entries: local.entries.map((entry) => (entry.id === entryId ? { ...entry, status } : entry)),
    })
    return
  }

  const { error } = await supabase.from('entries').update({ status }).eq('id', entryId)
  if (error) throw error
}

export async function updateSettings(settings: DashboardSettings) {
  if (!supabase) {
    const local = readLocalStore()
    writeLocalStore({ ...local, settings })
    return
  }

  const session = await requireSession()

  const { error } = await supabase.from('profiles').upsert({
    user_id: session.user.id,
    daily_summary_time: settings.dailySummaryTime,
    push_enabled: settings.pushEnabled,
    timezone: settings.timezone,
  })

  if (error) throw error
}

async function requireSession() {
  if (!supabase) throw new Error('Supabase bağlantısı yok.')

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) throw new Error('Bu işlem için önce oturum açman gerekiyor.')

  return session
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

function sanitizeSeriesDraft(draft: SeriesDraft): SeriesDraft {
  if (!draft.title.trim()) throw new Error('Seri başlığı gerekli.')

  const stages = draft.stages.filter((stage) => stage.title.trim() && stage.scheduledDate)
  if (stages.length === 0) throw new Error('En az bir aşama eklemen gerekiyor.')

  return { ...draft, stages }
}

function validateTaskDraft(draft: EntryDraft) {
  if (!draft.title.trim()) throw new Error('Görev başlığı gerekli.')
  if (!draft.scheduledDate) throw new Error('Görev tarihi gerekli.')
}

function mapEntryRow(row: Record<string, string>): AppEntry {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? '',
    scheduledDate: row.scheduled_date,
    status: (row.status as EntryStatus) ?? 'pending',
    type: (row.type as 'task' | 'stage') ?? 'task',
    seriesId: row.series_id ?? null,
    createdAt: row.created_at,
  }
}

function mapSeriesRow(row: Record<string, string>): AppSeries {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? '',
    siteUrl: row.site_url ?? '',
    briefUrl: row.brief_url ?? '',
    createdAt: row.created_at,
  }
}

function readLocalStore(): LocalStoreShape {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSeed))
    return defaultSeed
  }

  try {
    return JSON.parse(raw) as LocalStoreShape
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
