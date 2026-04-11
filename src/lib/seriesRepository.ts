export async function updateSeries(seriesId: string, updates: { siteUrl?: string; briefUrl?: string }) {
  const { supabase } = await import('./supabase')
  const { requireSession } = await import('./appRepository')

  if (!supabase) {
    const { readLocalStore, writeLocalStore } = await import('./appRepository')
    const local = readLocalStore()
    writeLocalStore({
      ...local,
      series: local.series.map((s) => (s.id === seriesId ? { ...s, ...updates } : s)),
    })
    return
  }

  const session = await requireSession()
  const { error } = await supabase
    .from('series')
    .update({
      site_url: updates.siteUrl?.trim() || null,
      brief_url: updates.briefUrl?.trim() || null,
    })
    .eq('id', seriesId)
    .eq('user_id', session.user.id)

  if (error) throw error
}
