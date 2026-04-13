import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, isBefore, isToday, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import projectLogo from '../logo.png'
import './App.css'
import {
  createSeries,
  createTask,
  deleteEntry,
  deleteSeries,
  getBootstrapData,
  getPushSupport,
  reorderSeriesStages,
  signInWithMagicLink,
  signOut,
  subscribeToPush,
  updateEntry,
  updateEntryStatus,
  updateSeries,
  updateSettings,
  verifyLocalPushDelivery,
  watchAuth,
  type BootstrapData,
} from './lib/appRepository'
import { getCountdownLabel, getRelativeTone, sortEntriesByDate } from './lib/date'
import type {
  AppEntry,
  AppSeries,
  DashboardSettings,
  EntryDraft,
  EntryRecurrence,
  EntryStatus,
  SeriesDraft,
  SeriesStageDraft,
} from './types'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const projectName = 'TraceLog'
type EntryFilter = 'all' | 'tasks' | 'stages'

const defaultTaskDraft: EntryDraft = {
  title: '',
  scheduledDate: '',
  notes: '',
  recurrence: 'none',
}

const createEmptyStage = (): SeriesStageDraft => ({
  title: '',
  scheduledDate: '',
  notes: '',
  recurrence: 'none',
})

const createDefaultSeriesDraft = (): SeriesDraft => ({
  title: '',
  notes: '',
  siteUrl: '',
  briefUrl: '',
  stages: [createEmptyStage(), createEmptyStage()],
})

function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [taskDraft, setTaskDraft] = useState<EntryDraft>(defaultTaskDraft)
  const [seriesDraft, setSeriesDraft] = useState<SeriesDraft>(createDefaultSeriesDraft)
  const [submittingTask, setSubmittingTask] = useState(false)
  const [submittingSeries, setSubmittingSeries] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [appNotice, setAppNotice] = useState<string | null>(null)
  const [entryFilter, setEntryFilter] = useState<EntryFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSeriesId, setSelectedSeriesId] = useState('all')
  const [seriesUrlErrors, setSeriesUrlErrors] = useState<string[]>([])
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installNotice, setInstallNotice] = useState<string | null>(null)
  const [pushCheckResult, setPushCheckResult] = useState<string | null>(null)
  const [settingsDraft, setSettingsDraft] = useState({
    dailySummaryTime: '09:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    displayName: '',
  })

  const [searchParams, setSearchParams] = useSearchParams()
  // Default values when URL doesn't specify which panels are open
  const defaultPanels = ['task', 'calendar', 'manage']

  const getOpenPanels = () => {
    const p = searchParams.get('p')
    return p !== null ? p.split(',') : defaultPanels
  }
  const openPanels = getOpenPanels()

  const isPanelOpen = (panelKey: string) => openPanels.includes(panelKey)

  const togglePanel = (panelKey: string) => {
    let nextPanels = [...openPanels]
    if (nextPanels.includes(panelKey)) {
      nextPanels = nextPanels.filter((p) => p !== panelKey)
    } else {
      nextPanels.push(panelKey)
    }
    const newParams = new URLSearchParams(searchParams)
    newParams.set('p', nextPanels.join(','))
    setSearchParams(newParams)
  }

  useEffect(() => {
    let isMounted = true

    getBootstrapData().then((data) => {
      if (!isMounted) return
      setBootstrap(data)
      setLoading(false)
    })

    const unsubscribe = watchAuth(async () => {
      const data = await getBootstrapData()
      if (!isMounted) return
      setBootstrap(data)
      setAuthReady(true)
      setLoading(false)
    })

    const handleOnline = async () => {
      const data = await getBootstrapData()
      if (!isMounted) return
      setBootstrap(data)
    }

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    setAuthReady(true)

    return () => {
      isMounted = false
      unsubscribe()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
    }
  }, [])

  useEffect(() => {
    if (!bootstrap) return
    setSettingsDraft({
      dailySummaryTime: bootstrap.settings.dailySummaryTime,
      timezone: bootstrap.settings.timezone,
      displayName: bootstrap.settings.displayName,
    })
  }, [bootstrap])

  const dashboard = useMemo(() => {
    if (!bootstrap) return null

    const sortedEntries = sortEntriesByDate(bootstrap.entries)
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const activeEntries = sortedEntries.filter((entry) => {
      const date = parseISO(entry.scheduledDate)
      return entry.status === 'pending' && !isBefore(date, startOfToday)
    })
    const archivedEntries = sortedEntries.filter((entry) => !activeEntries.includes(entry))
    const upcoming = activeEntries[0] ?? null
    const todayCount = activeEntries.filter((entry) => isToday(parseISO(entry.scheduledDate))).length
    const seriesMap = new Map(bootstrap.series.map((item) => [item.id, item]))
    const seriesEntries = bootstrap.series.map((series) => ({
      series,
      entries: sortEntriesByDate(
        bootstrap.entries.filter((entry) => entry.seriesId === series.id && entry.type === 'stage'),
      ),
    }))

    return {
      activeEntries,
      archivedEntries,
      upcoming,
      todayCount,
      activeCount: activeEntries.length,
      seriesMap,
      seriesEntries,
    }
  }, [bootstrap])

  const filteredActiveEntries = useMemo(() => {
    if (!dashboard) return []
    const query = searchQuery.trim().toLocaleLowerCase('tr')

    return dashboard.activeEntries.filter((entry) => {
      if (entryFilter === 'tasks' && entry.type !== 'task') return false
      if (entryFilter === 'stages' && entry.type !== 'stage') return false
      if (entry.type === 'stage' && selectedSeriesId !== 'all' && entry.seriesId !== selectedSeriesId) return false

      if (!query) return true

      const seriesTitle = entry.seriesId ? dashboard.seriesMap.get(entry.seriesId)?.title ?? '' : ''
      return [entry.title, entry.notes, seriesTitle].join(' ').toLocaleLowerCase('tr').includes(query)
    })
  }, [dashboard, entryFilter, searchQuery, selectedSeriesId])

  const stageSeriesOptions = useMemo(
    () => dashboard?.seriesEntries.filter((item) => item.entries.length > 0).map((item) => item.series) ?? [],
    [dashboard],
  )

  const calendarGroups = useMemo(() => {
    if (!dashboard) return []
    const groups = new Map<string, AppEntry[]>()
    dashboard.activeEntries.forEach((entry) => {
      groups.set(entry.scheduledDate, [...(groups.get(entry.scheduledDate) ?? []), entry])
    })

    return Array.from(groups.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, entries]) => ({ date, entries: sortEntriesByDate(entries) }))
  }, [dashboard])

  if (loading || !authReady || !bootstrap || !dashboard) {
    return <div className="shell loading-shell">Hazırlanıyor...</div>
  }

  const showLogin = bootstrap.mode === 'supabase' && !bootstrap.session
  const pushSupport = getPushSupport()

  const refreshData = async () => {
    const data = await getBootstrapData()
    setBootstrap(data)
  }

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthNotice(null)

    try {
      await signInWithMagicLink(email)
      setAuthNotice('Giriş bağlantısı e-posta adresine gönderildi.')
    } catch (error) {
      setAuthNotice(error instanceof Error ? error.message : 'Giriş bağlantısı gönderilemedi.')
    }
  }

  const handleLogout = async () => {
    setAppNotice(null)
    try {
      await signOut()
      await refreshData()
    } catch (error) {
      setAppNotice(error instanceof Error ? error.message : 'Çıkış yapılamadı.')
    }
  }

  const handleTaskSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmittingTask(true)
    setAppNotice(null)

    try {
      await createTask(taskDraft)
      setTaskDraft(defaultTaskDraft)
      await refreshData()
    } catch (error) {
      setAppNotice(error instanceof Error ? error.message : 'Görev eklenemedi.')
    } finally {
      setSubmittingTask(false)
    }
  }

  const handleSeriesSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmittingSeries(true)
    setAppNotice(null)

    const errors = [
      ...validateOptionalUrl(seriesDraft.siteUrl, 'Site linki'),
      ...validateOptionalUrl(seriesDraft.briefUrl, 'Şartname linki'),
    ]
    setSeriesUrlErrors(errors)

    if (errors.length > 0) {
      setSubmittingSeries(false)
      return
    }

    try {
      await createSeries(seriesDraft)
      setSeriesDraft(createDefaultSeriesDraft())
      await refreshData()
    } catch (error) {
      setAppNotice(error instanceof Error ? error.message : 'Seri eklenemedi.')
    } finally {
      setSubmittingSeries(false)
    }
  }
  const handleStatusChange = async (entryId: string, status: EntryStatus) => {
    setAppNotice(null)
    try {
      await updateEntryStatus(entryId, status)
      await refreshData()
    } catch (error) {
      setAppNotice(error instanceof Error ? error.message : 'Kayıt güncellenemedi.')
    }
  }

  const handleEntryUpdate = async (entryId: string, draft: EntryDraft) => {
    setAppNotice(null)
    try {
      // Find the entry to check if it's a stage and get its seriesId
      // const entry = bootstrap?.entries.find(e => e.id === entryId);
      
      await updateEntry(entryId, draft)
      
      // If this is a stage and we have series info, we might need to update the series too
      // but the user wants the form to handle the "all stages" update logic.
      // In the TimelineCard edit form, we already handle onSeriesUpdate if provided.
      
      await refreshData()
    } catch (error) {
      setAppNotice(error instanceof Error ? error.message : 'Kayıt güncellenemedi.')
    }
  }

  const handleEntryDelete = async (entryId: string) => {
    setAppNotice(null)
    try {
      await deleteEntry(entryId)
      await refreshData()
    } catch (error) {
      setAppNotice(error instanceof Error ? error.message : 'Kayıt silinemedi.')
    }
  }

  const handleSeriesUpdate = async (
    seriesId: string,
    updates: { title?: string; notes?: string; siteUrl?: string; briefUrl?: string },
  ) => {
    setAppNotice(null)
    const errors = [
      ...validateOptionalUrl(updates.siteUrl ?? '', 'Site linki'),
      ...validateOptionalUrl(updates.briefUrl ?? '', 'Şartname linki'),
    ]

    if (errors.length > 0) {
      setAppNotice(errors.join(' '))
      return
    }

    try {
      await updateSeries(seriesId, updates)
      await refreshData()
    } catch (error) {
      setAppNotice(error instanceof Error ? error.message : 'Yarışma bilgileri güncellenemedi.')
    }
  }

  const handleSeriesDelete = async (seriesId: string, title: string) => {
    if (!window.confirm(`"${title}" ve tüm aşamaları silinsin mi?`)) return

    setAppNotice(null)
    try {
      await deleteSeries(seriesId)
      await refreshData()
    } catch (error) {
      setAppNotice(error instanceof Error ? error.message : 'Yarışma silinemedi.')
    }
  }

  const handleStageReorder = async (seriesId: string, orderedIds: string[]) => {
    setAppNotice(null)
    try {
      await reorderSeriesStages(seriesId, orderedIds)
      await refreshData()
    } catch (error) {
      setAppNotice(error instanceof Error ? error.message : 'Aşama sırası güncellenemedi.')
    }
  }

  const handleSettingsChange = async (nextSettings: Partial<DashboardSettings>, pushIntent = false) => {
    setSavingSettings(true)
    setAppNotice(null)

    try {
      let updatedSettings = { ...bootstrap.settings, ...nextSettings }

      if (pushIntent && nextSettings.pushEnabled) {
        const support = getPushSupport()
        if (!support.supported) throw new Error(support.reason)
        const registration = await subscribeToPush()
        updatedSettings = { ...updatedSettings, pushEnabled: registration.subscribed }
      }

      await updateSettings(updatedSettings)
      await refreshData()
    } catch (error) {
      setAppNotice(error instanceof Error ? error.message : 'Ayarlar güncellenemedi.')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleSettingsSave = async () => {
    await handleSettingsChange({
      dailySummaryTime: settingsDraft.dailySummaryTime,
      timezone: settingsDraft.timezone,
      displayName: settingsDraft.displayName,
    })
  }

  const handleInstall = async () => {
    if (!installPrompt) {
      setInstallNotice('Android üzerinde tarayıcı menüsünden Ana ekrana ekle ile kurulumu tamamlayabilirsin.')
      return
    }

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setInstallPrompt(null)
    setInstallNotice(choice.outcome === 'accepted' ? 'Kurulum başlatıldı.' : 'Kurulum penceresi kapatıldı.')
  }

  const handlePushVerification = async () => {
    setPushCheckResult(null)

    try {
      await verifyLocalPushDelivery()
      setPushCheckResult('Test bildirimi gönderildi. Bildirim geldiyse teslim doğrulandı.')
    } catch (error) {
      setPushCheckResult(error instanceof Error ? error.message : 'Bildirim doğrulaması başarısız oldu.')
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <section className="project-card">
          <img src={projectLogo} alt={`${projectName} logo`} className="logo-image" />
        </section>

        {dashboard.upcoming ? (
          <section className="countdown-panel">
            <div>
              <span className="label">Sıradaki</span>
              <strong>{dashboard.upcoming.title}</strong>
            </div>
            <div className="countdown-value">{getCountdownLabel(dashboard.upcoming.scheduledDate)}</div>
            <p>{format(parseISO(dashboard.upcoming.scheduledDate), 'd MMMM yyyy', { locale: tr })}</p>
          </section>
        ) : (
          <section className="countdown-panel">
            <div>
              <span className="label">Sıradaki</span>
              <strong>Aktif kayıt yok</strong>
            </div>
            <div className="countdown-value">Hazır</div>
            <p>Yeni kayıt ekleyebilirsin.</p>
          </section>
        )}

        <section className="stats-grid">
          <article><span>Bugün</span><strong>{dashboard.todayCount}</strong></article>
          <article><span>Yaklaşan</span><strong>{dashboard.activeCount}</strong></article>
          <article><span>Senkron</span><strong>{bootstrap.syncPendingCount}</strong></article>
        </section>

        <nav className="mobile-quick-nav">
          <a href="#isler">İşler</a>
          <a href="#takvim">Takvim</a>
          <a href="#yarismalar">Yarışmalar</a>
          <a href="#profil">Profil</a>
        </nav>
      </aside>

      <main className="content">
        {showLogin ? (
          <section className="panel login-panel">
            <div className="panel-heading"><div><h2>Giriş</h2></div></div>
            <form className="stack-form" onSubmit={handleLogin}>
              <label>
                <span>E-posta</span>
                <input type="email" placeholder="mail@ornek.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <button type="submit">Giriş bağlantısı gönder</button>
            </form>
            {authNotice ? <p className="inline-note">{authNotice}</p> : null}
          </section>
        ) : (
          <>
            {bootstrap.isOffline || bootstrap.syncPendingCount > 0 ? (
              <section className="status-banner">
                <strong>{bootstrap.isOffline ? 'Çevrimdışı mod' : 'Senkron bekliyor'}</strong>
                <span>
                  {bootstrap.isOffline
                    ? 'Yaptığın değişiklikler cihazda tutuluyor, bağlantı gelince Supabase’e gönderilecek.'
                    : `${bootstrap.syncPendingCount} işlem sırada bekliyor.`}
                </span>
              </section>
            ) : null}

            {installPrompt || installNotice ? (
              <section className="status-banner install-banner">
                <strong>Mobil kurulum</strong>
                <span>Android için uygulama gibi açılması hazır. Kurulum adımını buradan tetikleyebilirsin.</span>
                <div className="inline-actions compact-actions">
                  <button type="button" onClick={() => void handleInstall()}>Ana ekrana ekle</button>
                  {installNotice ? <span className="inline-note">{installNotice}</span> : null}
                </div>
              </section>
            ) : null}

            <section className="panel" id="isler">
              <div className="panel-heading panel-heading-tight">
                <div><h2>İşler</h2></div>
                <div className="list-controls">
                  <div className="filter-tabs" role="tablist" aria-label="İş filtreleri">
                    <button type="button" className={entryFilter === 'all' ? 'filter-tab is-active' : 'filter-tab'} onClick={() => setEntryFilter('all')}>Tümü</button>
                    <button type="button" className={entryFilter === 'tasks' ? 'filter-tab is-active' : 'filter-tab'} onClick={() => setEntryFilter('tasks')}>Görevler</button>
                    <button type="button" className={entryFilter === 'stages' ? 'filter-tab is-active' : 'filter-tab'} onClick={() => setEntryFilter('stages')}>Yarışmalar</button>
                  </div>
                  <label className="inline-filter">
                    <span className="sr-only">Ara</span>
                    <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Ara" />
                  </label>
                  <label className="inline-filter">
                    <span className="sr-only">Yarışma filtresi</span>
                    <select value={selectedSeriesId} onChange={(event) => setSelectedSeriesId(event.target.value)}>
                      <option value="all">Tüm yarışmalar</option>
                      {stageSeriesOptions.map((series) => (
                        <option key={series.id} value={series.id}>{series.title}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="timeline">
                {filteredActiveEntries.length === 0 ? (
                  <div className="empty-state">Kayıt yok.</div>
                ) : (
                  filteredActiveEntries.map((entry) => (
                    <TimelineCard
                      key={entry.id}
                      entry={entry}
                      series={entry.seriesId ? dashboard.seriesMap.get(entry.seriesId) ?? null : null}
                      onStatusChange={handleStatusChange}
                      onUpdate={handleEntryUpdate}
                      onDelete={handleEntryDelete}
                      onSeriesUpdate={handleSeriesUpdate}
                    />
                  ))
                )}
              </div>
            </section>

            {appNotice ? <p className="inline-note">{appNotice}</p> : null}
            <CollapsiblePanel title="Görev ekle" isOpen={isPanelOpen('task')} onToggle={() => togglePanel('task')}>
              <form className="stack-form" onSubmit={handleTaskSubmit}>
                <div className="dual-grid">
                  <label>
                    <span>Başlık</span>
                    <input type="text" placeholder="Spor salonu, başvuru teslimi..." value={taskDraft.title} onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))} required />
                  </label>
                  <label>
                    <span>Tarih</span>
                    <input type="date" className={taskDraft.scheduledDate ? 'has-value' : 'is-empty'} value={taskDraft.scheduledDate} onChange={(event) => setTaskDraft((current) => ({ ...current, scheduledDate: event.target.value }))} required />
                  </label>
                </div>
                <label>
                  <span>Tekrar</span>
                  <select value={taskDraft.recurrence} onChange={(event) => setTaskDraft((current) => ({ ...current, recurrence: event.target.value as EntryRecurrence }))}>
                    <option value="none">Tek sefer</option>
                    <option value="daily">Her gün</option>
                    <option value="weekly">Her hafta</option>
                    <option value="monthly">Her ay</option>
                  </select>
                </label>
                <label>
                  <span>Not</span>
                  <textarea rows={3} placeholder="İstersen kısa bir not ekle." value={taskDraft.notes} onChange={(event) => setTaskDraft((current) => ({ ...current, notes: event.target.value }))} />
                </label>
                <button type="submit" disabled={submittingTask}>{submittingTask ? 'Ekleniyor...' : 'Görev ekle'}</button>
              </form>
            </CollapsiblePanel>

            <CollapsiblePanel title="Yarışma ekle" isOpen={isPanelOpen('series')} onToggle={() => togglePanel('series')}>
              <form className="stack-form" onSubmit={handleSeriesSubmit}>
                <div className="dual-grid">
                  <label>
                    <span>Yarışma</span>
                    <input type="text" placeholder="Yarışma 2026" value={seriesDraft.title} onChange={(event) => setSeriesDraft((current) => ({ ...current, title: event.target.value }))} required />
                  </label>
                  <label>
                    <span>Not</span>
                    <input type="text" placeholder="Kısa açıklama" value={seriesDraft.notes} onChange={(event) => setSeriesDraft((current) => ({ ...current, notes: event.target.value }))} />
                  </label>
                </div>
                <div className="dual-grid">
                  <label>
                    <span>Site linki</span>
                    <input type="url" placeholder="https://..." value={seriesDraft.siteUrl} onChange={(event) => setSeriesDraft((current) => ({ ...current, siteUrl: event.target.value }))} />
                  </label>
                  <label>
                    <span>Şartname linki</span>
                    <input type="url" placeholder="https://..." value={seriesDraft.briefUrl} onChange={(event) => setSeriesDraft((current) => ({ ...current, briefUrl: event.target.value }))} />
                  </label>
                </div>
                {seriesUrlErrors.length > 0 ? <ValidationList errors={seriesUrlErrors} /> : null}
                <div className="stages">
                  {seriesDraft.stages.map((stage, index) => (
                    <div key={`stage-${index}`} className="stage-editor-card">
                      <div className="stage-row">
                        <label>
                          <span>Aşama</span>
                          <input type="text" placeholder={index === 0 ? 'Ön eleme' : 'Final'} value={stage.title} onChange={(event) => updateStage(index, 'title', event.target.value, setSeriesDraft)} required />
                        </label>
                        <label>
                          <span>Tarih</span>
                          <input type="date" className={stage.scheduledDate ? 'has-value' : 'is-empty'} value={stage.scheduledDate} onChange={(event) => updateStage(index, 'scheduledDate', event.target.value, setSeriesDraft)} required />
                        </label>
                        <label>
                          <span>Not</span>
                          <input type="text" placeholder="Detay" value={stage.notes} onChange={(event) => updateStage(index, 'notes', event.target.value, setSeriesDraft)} />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="inline-actions compact-actions">
                  <button type="button" className="secondary-button" onClick={() => setSeriesDraft((current) => ({ ...current, stages: [...current.stages, createEmptyStage()] }))}>Aşama ekle</button>
                  <button type="submit" disabled={submittingSeries}>{submittingSeries ? 'Kaydediliyor...' : 'Yarışmayı kaydet'}</button>
                </div>
              </form>
            </CollapsiblePanel>

            <CollapsiblePanel title="Takvim görünümü" isOpen={isPanelOpen('calendar')} onToggle={() => togglePanel('calendar')} panelId="takvim">
              <div className="calendar-list">
                {calendarGroups.length === 0 ? (
                  <div className="empty-state">Takvim boş.</div>
                ) : (
                  calendarGroups.map((group) => (
                    <section key={group.date} className="calendar-day">
                      <header>
                        <strong>{format(parseISO(group.date), 'd MMMM yyyy, EEEE', { locale: tr })}</strong>
                        <span>{group.entries.length} kayıt</span>
                      </header>
                      <div className="calendar-day-list">
                        {group.entries.map((entry) => (
                          <div key={entry.id} className="calendar-pill">
                            <span>{entry.title}</span>
                            <small>{entry.seriesId ? dashboard.seriesMap.get(entry.seriesId)?.title ?? 'Yarışma' : getRecurrenceLabel(entry.recurrence)}</small>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </CollapsiblePanel>

            <CollapsiblePanel title="Yarışmaları yönet" isOpen={isPanelOpen('manage')} onToggle={() => togglePanel('manage')} panelId="yarismalar">
              <div className="series-manager-list">
                {dashboard.seriesEntries.length === 0 ? (
                  <div className="empty-state">Yarışma yok.</div>
                ) : (
                  dashboard.seriesEntries.map(({ series, entries }) => (
                    <SeriesManagerCard key={series.id} series={series} entries={entries} onDelete={handleSeriesDelete} onSave={handleSeriesUpdate} onReorder={handleStageReorder} />
                  ))
                )}
              </div>
            </CollapsiblePanel>

            <CollapsiblePanel title="Bildirim ve kurulum" isOpen={isPanelOpen('settings')} onToggle={() => togglePanel('settings')}>
              <div className="stack-form">
                <div className="settings-row">
                  <label>
                    <span>Özet saati</span>
                    <input type="time" value={settingsDraft.dailySummaryTime} onChange={(event) => setSettingsDraft((current) => ({ ...current, dailySummaryTime: event.target.value }))} />
                  </label>
                  <label>
                    <span>Saat dilimi</span>
                    <input type="text" value={settingsDraft.timezone} onChange={(event) => setSettingsDraft((current) => ({ ...current, timezone: event.target.value }))} />
                  </label>
                </div>
                <div className="settings-card">
                  <strong>Push durumu</strong>
                  <p>{pushSupport.supported ? 'Push desteği hazır.' : pushSupport.reason}</p>
                  <div className="inline-actions compact-actions">
                    <button type="button" className={bootstrap.settings.pushEnabled ? 'toggle-on' : 'toggle-off'} onClick={() => void handleSettingsChange({ pushEnabled: !bootstrap.settings.pushEnabled }, true)} disabled={savingSettings}>
                      {bootstrap.settings.pushEnabled ? 'Push açık' : 'Push kapalı'}
                    </button>
                    <button type="button" className="secondary-button" onClick={() => void handlePushVerification()}>Teslimi doğrula</button>
                  </div>
                  {pushCheckResult ? <p className="inline-note">{pushCheckResult}</p> : null}
                </div>
                <div className="inline-actions compact-actions">
                  <button type="button" className="secondary-button" onClick={() => setSettingsDraft({
                    dailySummaryTime: bootstrap.settings.dailySummaryTime,
                    timezone: bootstrap.settings.timezone,
                    displayName: bootstrap.settings.displayName,
                  })}>Geri al</button>
                  <button type="button" onClick={() => void handleSettingsSave()} disabled={savingSettings}>
                    {savingSettings ? 'Kaydediliyor...' : 'Ayarları kaydet'}
                  </button>
                </div>
              </div>
            </CollapsiblePanel>
            <CollapsiblePanel title="Profil" isOpen={isPanelOpen('profile')} onToggle={() => togglePanel('profile')} panelId="profil">
              <div className="stack-form">
                <div className="profile-grid">
                  <label>
                    <span>Ad</span>
                    <input type="text" value={settingsDraft.displayName} onChange={(event) => setSettingsDraft((current) => ({ ...current, displayName: event.target.value }))} />
                  </label>
                  <label>
                    <span>E-posta</span>
                    <input type="text" value={bootstrap.session?.email ?? ''} readOnly />
                  </label>
                </div>
                <div className="inline-actions compact-actions">
                  <button type="button" onClick={() => void handleSettingsSave()} disabled={savingSettings}>
                    {savingSettings ? 'Kaydediliyor...' : 'Profili kaydet'}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => void refreshData()}>Yenile</button>
                  <button type="button" className="danger-button" onClick={() => void handleLogout()}>Çıkış yap</button>
                </div>
              </div>
            </CollapsiblePanel>

            <CollapsiblePanel title="Arşiv" isOpen={isPanelOpen('archive')} onToggle={() => togglePanel('archive')}>
              <div className="archive-list">
                {dashboard.archivedEntries.length === 0 ? (
                  <div className="empty-state">Arşiv boş.</div>
                ) : (
                  dashboard.archivedEntries.map((entry) => (
                    <TimelineCard
                      key={entry.id}
                      entry={entry}
                      series={entry.seriesId ? dashboard.seriesMap.get(entry.seriesId) ?? null : null}
                      compact
                      onStatusChange={handleStatusChange}
                      onUpdate={handleEntryUpdate}
                      onDelete={handleEntryDelete}
                      onSeriesUpdate={handleSeriesUpdate}
                    />
                  ))
                )}
              </div>
            </CollapsiblePanel>
          </>
        )}
      </main>
    </div>
  )
}

function CollapsiblePanel({ title, isOpen, onToggle, children, panelId }: { title: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode; panelId?: string }) {
  return (
    <section className={`panel collapsible-panel ${isOpen ? 'is-open' : ''}`} id={panelId}>
      <div className="panel-heading" onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div><h2>{title}</h2></div>
        <div className={`collapse-icon ${isOpen ? 'is-open' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
      </div>
      <div className="collapsible-content">{children}</div>
    </section>
  )
}

function SeriesManagerCard({ series, entries, onSave, onDelete, onReorder }: { series: AppSeries; entries: AppEntry[]; onSave: (seriesId: string, updates: { title?: string; notes?: string; siteUrl?: string; briefUrl?: string }) => Promise<void>; onDelete: (seriesId: string, title: string) => Promise<void>; onReorder: (seriesId: string, orderedIds: string[]) => Promise<void> }) {
  const [draft, setDraft] = useState({ title: series.title, notes: series.notes, siteUrl: series.siteUrl, briefUrl: series.briefUrl })
  const [stageIds, setStageIds] = useState(entries.map((entry) => entry.id))
  const [search, setSearch] = useState('')

  useEffect(() => {
    setDraft({ title: series.title, notes: series.notes, siteUrl: series.siteUrl, briefUrl: series.briefUrl })
    setStageIds(entries.map((entry) => entry.id))
  }, [series, entries])

  const orderedEntries = stageIds
    .map((id) => entries.find((entry) => entry.id === id))
    .filter((entry): entry is AppEntry => Boolean(entry))
    .filter((entry) => [entry.title, entry.notes].join(' ').toLocaleLowerCase('tr').includes(search.trim().toLocaleLowerCase('tr')))

  const moveStage = async (entryId: string, direction: -1 | 1) => {
    const currentIndex = stageIds.findIndex((id) => id === entryId)
    const targetIndex = currentIndex + direction
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= stageIds.length) return

    const next = [...stageIds]
    ;[next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]]
    setStageIds(next)
    await onReorder(series.id, next)
  }

  return (
    <article className="series-manager-card">
      <div className="series-manager-header">
        <h3>{series.title}</h3>
        <div className="inline-actions compact-actions">
          <button type="button" className="secondary-button" onClick={() => void onSave(series.id, draft)}>Kaydet</button>
          <button type="button" className="danger-button" onClick={() => void onDelete(series.id, series.title)}>Toplu sil</button>
        </div>
      </div>
      <div className="dual-grid">
        <label><span>Yarışma adı</span><input type="text" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
        <label><span>Not</span><input type="text" value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
      </div>
      <div className="dual-grid">
        <label><span>Site linki</span><input type="url" value={draft.siteUrl} onChange={(event) => setDraft((current) => ({ ...current, siteUrl: event.target.value }))} /></label>
        <label><span>Şartname linki</span><input type="url" value={draft.briefUrl} onChange={(event) => setDraft((current) => ({ ...current, briefUrl: event.target.value }))} /></label>
      </div>
      <label className="inline-filter"><span className="sr-only">Aşama ara</span><input type="search" placeholder="Aşamalarda ara" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="stage-order-list">
        {orderedEntries.map((entry, index) => (
          <div key={entry.id} className="stage-order-item">
            <div>
              <strong>{entry.title}</strong>
              <span>{format(parseISO(entry.scheduledDate), 'd MMM yyyy', { locale: tr })}</span>
            </div>
            <div className="inline-actions compact-actions">
              <ActionIconButton label="Yukarı" onClick={() => void moveStage(entry.id, -1)}><svg viewBox="0 0 24 24"><path d="m18 15-6-6-6 6"></path></svg></ActionIconButton>
              <ActionIconButton label="Aşağı" onClick={() => void moveStage(entry.id, 1)}><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"></path></svg></ActionIconButton>
              <span className="stage-index">{index + 1}</span>
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}
export function TimelineCard({ entry, series, onStatusChange, onUpdate, onDelete, onSeriesUpdate, compact = false }: { entry: AppEntry; series: AppSeries | null; onStatusChange: (entryId: string, status: EntryStatus) => Promise<void>; onUpdate: (entryId: string, draft: EntryDraft) => Promise<void>; onDelete: (entryId: string) => Promise<void>; onSeriesUpdate?: (seriesId: string, updates: { title?: string; notes?: string; siteUrl?: string; briefUrl?: string }) => Promise<void>; compact?: boolean }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<EntryDraft>({ title: entry.title, scheduledDate: entry.scheduledDate, notes: entry.notes, recurrence: entry.recurrence })
  const [editSeriesUrl, setEditSeriesUrl] = useState({ siteUrl: series?.siteUrl ?? '', briefUrl: series?.briefUrl ?? '' })
  const [urlErrors, setUrlErrors] = useState<string[]>([])

  useEffect(() => {
    setEditDraft({ title: entry.title, scheduledDate: entry.scheduledDate, notes: entry.notes, recurrence: entry.recurrence })
    setEditSeriesUrl({ siteUrl: series?.siteUrl ?? '', briefUrl: series?.briefUrl ?? '' })
    setUrlErrors([])
    setIsEditing(false)
  }, [entry, series])

  const handleEditSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const errors = [...validateOptionalUrl(editSeriesUrl.siteUrl, 'Site linki'), ...validateOptionalUrl(editSeriesUrl.briefUrl, 'Şartname linki')]
    setUrlErrors(errors)
    if (errors.length > 0) return

    await onUpdate(entry.id, editDraft)
    if (series && onSeriesUpdate) await onSeriesUpdate(series.id, editSeriesUrl)
  }

  return (
    <article className={`timeline-card ${compact ? 'compact-card' : ''}`}>
      <div className="timeline-main">
        <div className="card-header">
          <span className={`tone-${getRelativeTone(entry.scheduledDate)}`}>{getCountdownLabel(entry.scheduledDate)}</span>
          <small>{format(parseISO(entry.scheduledDate), 'd MMM yyyy', { locale: tr })}</small>
          {series ? <div className="series-tag">{series.title}</div> : null}
          {entry.type === 'task' && entry.recurrence !== 'none' ? <div className="series-tag recurrence-tag">{getRecurrenceLabel(entry.recurrence)}</div> : null}
          {entry.syncState === 'queued' ? <div className="series-tag queued-tag">Sırada</div> : null}
        </div>
        {isEditing ? (
          <form className="entry-edit-form" onSubmit={handleEditSubmit}>
            <div className="dual-grid">
              <input type="text" aria-label="Başlık" value={editDraft.title} onChange={(event) => setEditDraft((current) => ({ ...current, title: event.target.value }))} required />
              <input type="date" aria-label="Tarih" className={editDraft.scheduledDate ? 'has-value' : 'is-empty'} value={editDraft.scheduledDate} onChange={(event) => setEditDraft((current) => ({ ...current, scheduledDate: event.target.value }))} required />
            </div>
            {entry.type === 'task' ? (
              <select value={editDraft.recurrence} onChange={(event) => setEditDraft((current) => ({ ...current, recurrence: event.target.value as EntryRecurrence }))}>
                <option value="none">Tek sefer</option>
                <option value="daily">Her gün</option>
                <option value="weekly">Her hafta</option>
                <option value="monthly">Her ay</option>
              </select>
            ) : null}
            <textarea aria-label="Not" rows={3} value={editDraft.notes} onChange={(event) => setEditDraft((current) => ({ ...current, notes: event.target.value }))} />
            {series ? (
              <div className="dual-grid">
                <input type="url" placeholder="Site linki" value={editSeriesUrl.siteUrl} onChange={(event) => setEditSeriesUrl((prev) => ({ ...prev, siteUrl: event.target.value }))} />
                <input type="url" placeholder="Şartname linki" value={editSeriesUrl.briefUrl} onChange={(event) => setEditSeriesUrl((prev) => ({ ...prev, briefUrl: event.target.value }))} />
              </div>
            ) : null}
            {urlErrors.length > 0 ? <ValidationList errors={urlErrors} /> : null}
            <div className="inline-actions compact-actions">
              <button type="submit">Kaydet</button>
              <button type="button" className="secondary-button" onClick={() => setIsEditing(false)}>Vazgeç</button>
            </div>
          </form>
        ) : (
          <>
            <h3>{entry.title}</h3>
            {series && (series.siteUrl || series.briefUrl) ? (
              <div className="series-links">
                {series.siteUrl ? <a href={series.siteUrl} target="_blank" rel="noreferrer">Site</a> : null}
                {series.briefUrl ? <a href={series.briefUrl} target="_blank" rel="noreferrer">Şartname</a> : null}
              </div>
            ) : null}
            {entry.notes ? <p>{entry.notes}</p> : null}
          </>
        )}
      </div>
      <div className="card-actions">
        {!isEditing ? (
          <>
            {entry.status !== 'completed' ? <ActionIconButton label="Tamamlandı" onClick={() => void onStatusChange(entry.id, 'completed')}><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg></ActionIconButton> : null}
            {entry.status !== 'pending' ? <ActionIconButton label="Geri al" onClick={() => void onStatusChange(entry.id, 'pending')}><svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"></path><path d="M4 9h10a5 5 0 1 1 0 10h-1"></path></svg></ActionIconButton> : null}
            <ActionIconButton label="Düzenle" onClick={() => setIsEditing(true)}><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></ActionIconButton>
            <ActionIconButton label="Sil" variant="danger" onClick={() => { if (window.confirm(`"${entry.title}" silinsin mi?`)) void onDelete(entry.id) }}><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></ActionIconButton>
          </>
        ) : null}
      </div>
    </article>
  )
}

function ActionIconButton({ label, onClick, children, variant }: { label: string; onClick: () => void; children: React.ReactNode; variant?: 'danger' }) {
  return <button type="button" className={`icon-action ${variant === 'danger' ? 'icon-action-danger' : ''}`} aria-label={label} title={label} onClick={onClick}>{children}</button>
}

function ValidationList({ errors }: { errors: string[] }) {
  return <div className="validation-list">{errors.map((error) => <p key={error}>{error}</p>)}</div>
}

function validateOptionalUrl(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) return []

  const errors: string[] = []
  if (!/^https?:\/\//i.test(trimmed)) errors.push(`${label} http:// veya https:// ile başlamalı.`)

  try {
    const parsed = new URL(trimmed)
    if (!parsed.hostname.includes('.')) errors.push(`${label} geçerli bir alan adı içermeli.`)
  } catch {
    errors.push(`${label} geçerli bir URL değil.`)
  }

  return errors
}

function getRecurrenceLabel(recurrence: EntryRecurrence) {
  switch (recurrence) {
    case 'daily': return 'Her gün'
    case 'weekly': return 'Her hafta'
    case 'monthly': return 'Her ay'
    default: return 'Tek sefer'
  }
}

function updateStage(index: number, key: 'title' | 'scheduledDate' | 'notes', value: string, setSeriesDraft: React.Dispatch<React.SetStateAction<SeriesDraft>>) {
  setSeriesDraft((current) => ({
    ...current,
    stages: current.stages.map((stage, stageIndex) => (stageIndex === index ? { ...stage, [key]: value } : stage)),
  }))
}

export default App
