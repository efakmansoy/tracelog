import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const publicKey = Deno.env.get('WEB_PUSH_PUBLIC_KEY') ?? ''
const privateKey = Deno.env.get('WEB_PUSH_PRIVATE_KEY') ?? ''

webpush.setVapidDetails(
  'mailto:notify@example.com',
  publicKey,
  privateKey,
)

serve(async () => {
  if (!publicKey || !privateKey) {
    return new Response('Missing push configuration', { status: 500 })
  }

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('user_id, timezone, daily_summary_time, last_summary_sent_local_date, push_enabled')
    .eq('push_enabled', true)

  if (profileError) {
    return new Response(profileError.message, { status: 500 })
  }

  const now = new Date()
  const results: Array<{ userId: string; sent: number; revoked: number; skipped: boolean }> = []

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

    const [{ data: entries, error: entriesError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
      supabase
        .from('entries')
        .select('title, scheduled_date, status')
        .eq('user_id', profile.user_id)
        .eq('status', 'pending')
        .gte('scheduled_date', localDate)
        .order('scheduled_date', { ascending: true })
        .limit(5),
      supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', profile.user_id)
        .is('revoked_at', null),
    ])

    if (entriesError || subscriptionsError) {
      console.error('Failed to load summary payload', {
        userId: profile.user_id,
        entriesError: entriesError?.message,
        subscriptionsError: subscriptionsError?.message,
      })
      continue
    }

    const body =
      entries && entries.length > 0
        ? entries.map((entry) => `${entry.scheduled_date}: ${entry.title}`).join(' | ')
        : 'Bugün için planlı kayıt bulunmuyor.'

    let sent = 0
    let revoked = 0

    for (const subscription of subscriptions ?? []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify({ title: 'Günlük özet', body }),
        )
        sent += 1
      } catch (error) {
        const statusCode =
          typeof error === 'object' && error !== null && 'statusCode' in error
            ? Number(error.statusCode)
            : 0

        console.error('Push delivery failed', {
          userId: profile.user_id,
          endpoint: subscription.endpoint,
          statusCode,
        })

        if (statusCode === 404 || statusCode === 410) {
          const { error: revokeError } = await supabase
            .from('push_subscriptions')
            .update({ revoked_at: new Date().toISOString() })
            .eq('endpoint', subscription.endpoint)

          if (revokeError) {
            console.error('Failed to revoke dead subscription', {
              endpoint: subscription.endpoint,
              message: revokeError.message,
            })
          } else {
            revoked += 1
          }
        }
      }
    }

    await supabase
      .from('profiles')
      .update({ last_summary_sent_local_date: localDate })
      .eq('user_id', profile.user_id)

    results.push({ userId: profile.user_id, sent, revoked, skipped: false })
  }

  return Response.json({ ok: true, results })
})
