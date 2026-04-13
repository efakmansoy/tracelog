import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const publicKey = Deno.env.get('WEB_PUSH_PUBLIC_KEY') ?? ''
const privateKey = Deno.env.get('WEB_PUSH_PRIVATE_KEY') ?? ''
const cronSecret = Deno.env.get('CRON_SECRET') ?? ''

webpush.setVapidDetails(
  'mailto:notify@example.com',
  publicKey,
  privateKey,
)

serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!publicKey || !privateKey || !cronSecret) {
    return new Response('Missing push configuration', { status: 500 })
  }

  const authHeader = request.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('user_id, timezone, daily_summary_time, last_summary_sent_local_date, push_enabled')
    .eq('push_enabled', true)

  if (profileError) {
    console.error('Failed to load enabled profiles', { message: profileError.message })
    return new Response('Internal error', { status: 500 })
  }

  const now = new Date()
  const results: Array<{ userId: string; sent: number; revoked: number; skipped: boolean }> = []
  const targetUsers: Array<{ userId: string; localDate: string }> = []

  for (const profile of profiles ?? []) {
    const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: profile.timezone }).format(now)
    const localTime = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: profile.timezone,
    }).format(now)

    if (localTime !== profile.daily_summary_time) {
      results.push({ userId: profile.user_id, sent: 0, revoked: 0, skipped: true })
      continue
    }
    if (profile.last_summary_sent_local_date === localDate) {
      results.push({ userId: profile.user_id, sent: 0, revoked: 0, skipped: true })
      continue
    }

    targetUsers.push({ userId: profile.user_id, localDate })
  }

  if (targetUsers.length === 0) {
    return Response.json({ ok: true, results })
  }

  const targetUserIds = targetUsers.map((u) => u.userId)
  const minLocalDate = targetUsers.map((u) => u.localDate).sort()[0]

  // Toplu (Batch) Data Fetching
  const [{ data: allEntries, error: entriesError }, { data: allSubscriptions, error: subscriptionsError }] = await Promise.all([
    supabase
      .from('entries')
      .select('user_id, title, scheduled_date')
      .in('user_id', targetUserIds)
      .eq('status', 'pending')
      .gte('scheduled_date', minLocalDate)
      .order('scheduled_date', { ascending: true }),
    supabase
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh, auth')
      .in('user_id', targetUserIds)
      .is('revoked_at', null),
  ])

  if (entriesError || subscriptionsError) {
    console.error('Failed to load bulk summary payload', {
      entriesError: entriesError?.message,
      subscriptionsError: subscriptionsError?.message,
    })
    return new Response('Internal error', { status: 500 })
  }

  // Gruplama
  const entriesByUser = new Map<string, Array<{ title: string; scheduled_date: string }>>()
  for (const e of allEntries ?? []) {
    const arr = entriesByUser.get(e.user_id) ?? []
    arr.push(e)
    entriesByUser.set(e.user_id, arr)
  }

  const subsByUser = new Map<string, Array<{ endpoint: string; p256dh: string; auth: string }>>()
  for (const s of allSubscriptions ?? []) {
    const arr = subsByUser.get(s.user_id) ?? []
    arr.push(s)
    subsByUser.set(s.user_id, arr)
  }

  // Push Bildirimlerini Paralel Gönderme Stratejisi
  const pushTasks: Array<Promise<{ userId: string; endpoint: string; success: boolean; revoked: boolean }>> = []

  for (const target of targetUsers) {
    const userEntries = (entriesByUser.get(target.userId) ?? [])
      .filter((e) => e.scheduled_date >= target.localDate)
      .slice(0, 5)

    const body = userEntries.length > 0
      ? userEntries.map((entry) => `${entry.scheduled_date}: ${entry.title}`).join(' | ')
      : 'Bugün için planlı kayıt bulunmuyor.'

    const subs = subsByUser.get(target.userId) ?? []

    for (const sub of subs) {
      const task = webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        JSON.stringify({ title: 'Günlük özet', body })
      ).then(() => {
        return { userId: target.userId, endpoint: sub.endpoint, success: true, revoked: false }
      }).catch((error: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error ? Number((error as any).statusCode) : 0
        console.error('Push delivery failed', { userId: target.userId, endpoint: sub.endpoint, statusCode })
        const revoked = statusCode === 404 || statusCode === 410
        return { userId: target.userId, endpoint: sub.endpoint, success: false, revoked }
      })
      pushTasks.push(task)
    }
  }

  const pushResults = await Promise.all(pushTasks)

  const endpointsToRevoke: string[] = []
  const userStats = new Map<string, { sent: number; revoked: number }>()

  for (const target of targetUsers) {
    userStats.set(target.userId, { sent: 0, revoked: 0 })
  }

  for (const r of pushResults) {
    const stats = userStats.get(r.userId)!
    if (r.success) stats.sent += 1
    if (r.revoked) {
      stats.revoked += 1
      endpointsToRevoke.push(r.endpoint)
    }
  }

  // Toplu Revoke (Geri Alma) İşlemi
  if (endpointsToRevoke.length > 0) {
    const { error: revokeError } = await supabase
      .from('push_subscriptions')
      .update({ revoked_at: new Date().toISOString() })
      .in('endpoint', endpointsToRevoke)

    if (revokeError) {
      console.error('Failed to revoke bulk subscriptions', { message: revokeError.message })
    }
  }

  // Toplu last_summary_sent_local_date Güncellemesi (LocalDate Bağımlı)
  const localDateGroups = new Map<string, string[]>()
  for (const target of targetUsers) {
    const arr = localDateGroups.get(target.localDate) ?? []
    arr.push(target.userId)
    localDateGroups.set(target.localDate, arr)
  }

  for (const [dateToSet, userIds] of localDateGroups.entries()) {
    // Supabase tek seferde verimli işleyebilmesi için 500'lük gruplar (chunks) halinde yollanıyor.
    for (let i = 0; i < userIds.length; i += 500) {
      const chunk = userIds.slice(i, i + 500)
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({ last_summary_sent_local_date: dateToSet })
        .in('user_id', chunk)

      if (profileUpdateError) {
        console.error('Failed to update bulk summary delivery marker', { date: dateToSet, message: profileUpdateError.message })
      }
    }
  }

  for (const target of targetUsers) {
    const stats = userStats.get(target.userId)!
    results.push({ userId: target.userId, sent: stats.sent, revoked: stats.revoked, skipped: false })
  }

  return Response.json({ ok: true, results })
})
