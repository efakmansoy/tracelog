import { useEffect, useMemo, useState } from 'react'
import { format, isBefore, isToday, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import projectLogo from '../logo.png'
import './App.css'
import {
  createSeries,
  createTask,
  deleteEntry,
  getBootstrapData,
  getPushSupport,
  signInWithMagicLink,
  subscribeToPush,
  updateEntry,
  updateEntryStatus,
  updateSettings,
  watchAuth,
  type BootstrapData,
} from './lib/appRepository'
import { updateSeries } from './lib/seriesRepository'
import { getCountdownLabel, getRelativeTone, sortEntriesByDate } from './lib/date'
import type {
  AppEntry,
  AppSeries,
  DashboardSettings,
  EntryDraft,
  EntryStatus,
  SeriesDraft,
} from './types'

const defaultTaskDraft: EntryDraft = {
  title: '',
  scheduledDate: '',
  notes: '',
}

const projectName = 'TraceLog'
type EntryFilter = 'all' | 'tasks' | 'stages'

const createDefaultSeriesDraft = (): SeriesDraft => ({
  title: '',
  notes: '',
  siteUrl: '',
  briefUrl: '',
  stages: [
    { title: '', scheduledDate: '', notes: '' },
    { title: '', scheduledDate: '', notes: '' },
  ],
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

  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false)
  const [isSeriesFormOpen, setIsSeriesFormOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isArchiveOpen, setIsArchiveOpen] = useState(false)

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

    setAuthReady(true)

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

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

    return {
      activeEntries,
      archivedEntries,
      upcoming,
      todayCount,
      activeCount: activeEntries.length,
      seriesMap,
    }
  }, [bootstrap])

  const stageSeriesOptions = useMemo(() => {
    if (!dashboard) return []

    const ids = new Set(
      dashboard.activeEntries
        .filter((entry) => entry.type === 'stage' && entry.seriesId)
        .map((entry) => entry.seriesId as string),
    )

    return Array.from(ids)
      .map((id) => dashboard.seriesMap.get(id))
      .filter((item): item is AppSeries => Boolean(item))
  }, [dashboard])

  const filteredActiveEntries = useMemo(() => {
    if (!dashboard) return []

    let entries = dashboard.activeEntries

    if (entryFilter === 'tasks') {
      entries = entries.filter((entry) => entry.type === 'task')
    }

    if (entryFilter === 'stages') {
      entries = entries.filter((entry) => entry.type === 'stage')
      if (selectedSeriesId !== 'all') {
        entries = entries.filter((entry) => entry.seriesId === selectedSeriesId)
      }
    }

    if (entryFilter !== 'stages' && searchQuery.trim()) {
      const query = searchQuery.trim().toLocaleLowerCase('tr')
      entries = entries.filter((entry) => {
        const seriesTitle = entry.seriesId
          ? dashboard.seriesMap.get(entry.seriesId)?.title ?? ''
          : ''

        return [entry.title, entry.notes, seriesTitle]
          .join(' ')
          .toLocaleLowerCase('tr')
          .includes(query)
      })
    }

    return entries
  }, [dashboard, entryFilter, searchQuery, selectedSeriesId])

  if (loading || !authReady || !bootstrap || !dashboard) {
    return <div className="shell loading-shell">Hazırlanıyor...</div>
  }

  const showLogin = bootstrap.mode === 'supabase' && !bootstrap.session

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
      await updateEntry(entryId, draft)
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

  const handleSeriesUpdate = async (seriesId: string, siteUrl: string, briefUrl: string) => {
    setAppNotice(null)

    try {
      await updateSeries(seriesId, { siteUrl, briefUrl })
      await refreshData()
    } catch (error) {
      setAppNotice(error instanceof Error ? error.message : 'Yarışma bilgileri güncellenemedi.')
    }
  }

  const handleSettingsChange = async (
    nextSettings: Partial<DashboardSettings>,
    pushIntent = false,
  ) => {
    setSavingSettings(true)
    setAppNotice(null)

    try {
      let updatedSettings = {
        ...bootstrap.settings,
        ...nextSettings,
      }

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

  return (
    <div className="shell">
      <aside className="sidebar">
        <section className="project-card">
          <div className="logo-slot" aria-label="Logo alanı">
            <img src={projectLogo} alt={`${projectName} logo`} className="logo-image" />
          </div>
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
            <p>Yeni kayıt ekle.</p>
          </section>
        )}

        <section className="stats-grid">
          <article><span>Bugün</span><strong>{dashboard.todayCount}</strong></article>
          <article><span>Yaklaşan</span><strong>{dashboard.activeCount}</strong></article>
          <article><span>Arşiv</span><strong>{dashboard.archivedEntries.length}</strong></article>
        </section>
      </aside>

      <main className="content">
        {showLogin ? (
          <section className="panel login-panel">
            <div className="panel-heading"><div><h2>Giriş</h2></div></div>

            <form className="stack-form" onSubmit={handleLogin}>
              <label>
                <span>E-posta</span>
                <input
                  type="email"
                  placeholder="mail@ornek.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <button type="submit">Giriş bağlantısı gönder</button>
            </form>
            {authNotice ? <p className="inline-note">{authNotice}</p> : null}
          </section>
        ) : (
          <>
            <section className="panel">
              <div className="panel-heading panel-heading-tight">
                <div><h2>İşler</h2></div>
                <div className="list-controls">
                  <div className="filter-tabs" role="tablist" aria-label="İş filtreleri">
                    <button
                      type="button"
                      className={entryFilter === 'all' ? 'filter-tab is-active' : 'filter-tab'}
                      onClick={() => setEntryFilter('all')}
                    >
                      Tümü
                    </button>
                    <button
                      type="button"
                      className={entryFilter === 'tasks' ? 'filter-tab is-active' : 'filter-tab'}
                      onClick={() => setEntryFilter('tasks')}
                    >
                      Görevler
                    </button>
                    <button
                      type="button"
                      className={entryFilter === 'stages' ? 'filter-tab is-active' : 'filter-tab'}
                      onClick={() => setEntryFilter('stages')}
                    >
                      Yarışmalar
                    </button>
                  </div>

                  {entryFilter === 'stages' ? (
                    <label className="inline-filter">
                      <span className="sr-only">Yarışma filtresi</span>
                      <select
                        value={selectedSeriesId}
                        onChange={(event) => setSelectedSeriesId(event.target.value)}
                      >
                        <option value="all">Tüm yarışmalar</option>
                        {stageSeriesOptions.map((series) => (
                          <option key={series.id} value={series.id}>
                            {series.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="inline-filter">
                      <span className="sr-only">İşlerde ara</span>
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Ara"
                      />
                    </label>
                  )}
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

            <section className={`panel collapsible-panel ${isTaskFormOpen ? 'is-open' : ''}`}>
              <div className="panel-heading" onClick={() => setIsTaskFormOpen(!isTaskFormOpen)} style={{ cursor: 'pointer' }}>
                <div><h2>Görev ekle</h2></div>
                <div className={`collapse-icon ${isTaskFormOpen ? 'is-open' : ''}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
              </div>

              <div className="collapsible-content">
                <form className="stack-form" onSubmit={handleTaskSubmit}>
                  <label>
                    <span>Başlık</span>
                    <input
                      type="text"
                      placeholder="Spor salonu, başvuru teslimi..."
                      value={taskDraft.title}
                      onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    <span>Tarih</span>
                    <input
                      type="date"
                      className={taskDraft.scheduledDate ? 'has-value' : ''}
                      value={taskDraft.scheduledDate}
                      onChange={(event) => setTaskDraft((current) => ({ ...current, scheduledDate: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    <span>Not</span>
                    <textarea
                      rows={3}
                      placeholder="İstersen kısa bir not ekle."
                      value={taskDraft.notes}
                      onChange={(event) => setTaskDraft((current) => ({ ...current, notes: event.target.value }))}
                    />
                  </label>
                  <button type="submit" disabled={submittingTask}>{submittingTask ? 'Ekleniyor...' : 'Görev ekle'}</button>
                </form>
              </div>
            </section>

            <section className={`panel collapsible-panel ${isSeriesFormOpen ? 'is-open' : ''}`}>
              <div className="panel-heading" onClick={() => setIsSeriesFormOpen(!isSeriesFormOpen)} style={{ cursor: 'pointer' }}>
                <div><h2>Yarışma ekle</h2></div>
                <div className={`collapse-icon ${isSeriesFormOpen ? 'is-open' : ''}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
              </div>

              <div className="collapsible-content">
                <form className="stack-form" onSubmit={handleSeriesSubmit}>
                  <label>
                    <span>Yarışma</span>
                    <input
                      type="text"
                      placeholder="Yarışması 2026"
                      value={seriesDraft.title}
                      onChange={(event) => setSeriesDraft((current) => ({ ...current, title: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    <span>Not</span>
                    <textarea
                      rows={2}
                      placeholder=""
                      value={seriesDraft.notes}
                      onChange={(event) => setSeriesDraft((current) => ({ ...current, notes: event.target.value }))}
                    />
                  </label>
                  <div className="stage-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <label>
                      <span>Site linki</span>
                      <input
                        type="url"
                        placeholder="https://..."
                        value={seriesDraft.siteUrl}
                        onChange={(event) =>
                          setSeriesDraft((current) => ({ ...current, siteUrl: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      <span>Şartname linki</span>
                      <input
                        type="url"
                        placeholder="https://..."
                        value={seriesDraft.briefUrl}
                        onChange={(event) =>
                          setSeriesDraft((current) => ({ ...current, briefUrl: event.target.value }))
                        }
                      />
                    </label>
                  </div>

                  <div className="stages">
                    {seriesDraft.stages.map((stage, index) => (
                      <div key={`stage-${index}`} className="stage-row">
                        <label>
                          <span>Aşama</span>
                          <input
                            type="text"
                            placeholder={index === 0 ? 'Ön eleme' : 'Final'}
                            value={stage.title}
                            onChange={(event) => updateStage(index, 'title', event.target.value, setSeriesDraft)}
                            required
                          />
                        </label>
                        <label>
                          <span>Tarih</span>
                          <input
                            type="date"
                            className={stage.scheduledDate ? 'has-value' : ''}
                            value={stage.scheduledDate}
                            onChange={(event) => updateStage(index, 'scheduledDate', event.target.value, setSeriesDraft)}
                            required
                          />
                        </label>
                        <label>
                          <span>Not</span>
                          <input
                            type="text"
                            placeholder="Detay"
                            value={stage.notes}
                            onChange={(event) => updateStage(index, 'notes', event.target.value, setSeriesDraft)}
                          />
                        </label>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setSeriesDraft((current) => ({
                        ...current,
                        stages: [...current.stages, { title: '', scheduledDate: '', notes: '' }],
                      }))
                    }
                  >
                    Aşama ekle
                  </button>
                  <button type="submit" disabled={submittingSeries}>{submittingSeries ? 'Oluşturuluyor...' : 'Seriyi kaydet'}</button>
                </form>
              </div>
            </section>

            <section className={`panel collapsible-panel ${isSettingsOpen ? 'is-open' : ''}`}>
              <div className="panel-heading" onClick={() => setIsSettingsOpen(!isSettingsOpen)} style={{ cursor: 'pointer' }}>
                <div><h2>Bildirim</h2></div>
                <div className={`collapse-icon ${isSettingsOpen ? 'is-open' : ''}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
              </div>

              <div className="collapsible-content">
                <div className="settings-row">
                  <label>
                    <span>Özet saati</span>
                    <input
                      type="time"
                      value={bootstrap.settings.dailySummaryTime}
                      onChange={(event) => void handleSettingsChange({ dailySummaryTime: event.target.value })}
                    />
                  </label>
                  <label className="toggle">
                    <span>Push bildirimi</span>
                    <button
                      type="button"
                      className={bootstrap.settings.pushEnabled ? 'toggle-on' : 'toggle-off'}
                      onClick={() => void handleSettingsChange({ pushEnabled: !bootstrap.settings.pushEnabled }, true)}
                      disabled={savingSettings}
                    >
                      {bootstrap.settings.pushEnabled ? 'Açık' : 'Kapalı'}
                    </button>
                  </label>
                </div>
              </div>
            </section>

            <section className={`panel collapsible-panel ${isArchiveOpen ? 'is-open' : ''}`}>
              <div className="panel-heading" onClick={() => setIsArchiveOpen(!isArchiveOpen)} style={{ cursor: 'pointer' }}>
                <div><h2>Arşiv</h2></div>
                <div className={`collapse-icon ${isArchiveOpen ? 'is-open' : ''}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
              </div>
              <div className="collapsible-content">
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
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

export function TimelineCard({
  entry,
  series,
  onStatusChange,
  onUpdate,
  onDelete,
  onSeriesUpdate,
  compact = false,
}: {
  entry: AppEntry
  series: AppSeries | null
  onStatusChange: (entryId: string, status: EntryStatus) => Promise<void>
  onUpdate: (entryId: string, draft: EntryDraft) => Promise<void>
  onDelete: (entryId: string) => Promise<void>
  onSeriesUpdate?: (seriesId: string, siteUrl: string, briefUrl: string) => Promise<void>
  compact?: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<EntryDraft>({
    title: entry.title,
    scheduledDate: entry.scheduledDate,
    notes: entry.notes,
  })
  const [editSeriesUrl, setEditSeriesUrl] = useState({
    siteUrl: series?.siteUrl ?? '',
    briefUrl: series?.briefUrl ?? '',
  })

  useEffect(() => {
    setEditDraft({
      title: entry.title,
      scheduledDate: entry.scheduledDate,
      notes: entry.notes,
    })
    setEditSeriesUrl({
      siteUrl: series?.siteUrl ?? '',
      briefUrl: series?.briefUrl ?? '',
    })
    setIsEditing(false)
  }, [entry, series])

  const handleEditSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onUpdate(entry.id, editDraft)
    if (series && onSeriesUpdate) {
      await onSeriesUpdate(series.id, editSeriesUrl.siteUrl, editSeriesUrl.briefUrl)
    }
  }

  return (
    <article className={`timeline-card ${compact ? 'compact-card' : ''}`}>
      <div>
        <div className="card-header">
          <span className={`tone-${getRelativeTone(entry.scheduledDate)}`}>{getCountdownLabel(entry.scheduledDate)}</span>
          <small>{format(parseISO(entry.scheduledDate), 'd MMM yyyy', { locale: tr })}</small>
          {series ? <div className="series-tag">{series.title}</div> : null}
        </div>
        {isEditing ? (
          <form className="entry-edit-form" onSubmit={handleEditSubmit}>
            <input
              type="text"
              aria-label="Başlık"
              value={editDraft.title}
              onChange={(event) =>
                setEditDraft((current) => ({ ...current, title: event.target.value }))
              }
              required
            />
            <input
              type="date"
              aria-label="Tarih"
              className={editDraft.scheduledDate ? 'has-value' : ''}
              value={editDraft.scheduledDate}
              onChange={(event) =>
                setEditDraft((current) => ({ ...current, scheduledDate: event.target.value }))
              }
              required
            />
            <textarea
              aria-label="Not"
              rows={3}
              value={editDraft.notes}
              onChange={(event) =>
                setEditDraft((current) => ({ ...current, notes: event.target.value }))
              }
            />
            {series && (
              <div className="stage-row" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '4px' }}>
                <input
                  type="url"
                  placeholder="Site linki"
                  value={editSeriesUrl.siteUrl}
                  onChange={(event) => setEditSeriesUrl(prev => ({ ...prev, siteUrl: event.target.value }))}
                />
                <input
                  type="url"
                  placeholder="Şartname linki"
                  value={editSeriesUrl.briefUrl}
                  onChange={(event) => setEditSeriesUrl(prev => ({ ...prev, briefUrl: event.target.value }))}
                />
              </div>
            )}
            <div className="inline-actions">
              <button type="submit">Kaydet</button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setEditDraft({
                    title: entry.title,
                    scheduledDate: entry.scheduledDate,
                    notes: entry.notes,
                  })
                  setIsEditing(false)
                }}
              >
                Vazgeç
              </button>
            </div>
          </form>
        ) : (
          <>
            <h3>{entry.title}</h3>
            {series && (series.siteUrl || series.briefUrl) ? (
              <div className="series-links">
                {series.siteUrl ? (
                  <a href={series.siteUrl} target="_blank" rel="noreferrer">
                    Site
                  </a>
                ) : null}
                {series.briefUrl ? (
                  <a href={series.briefUrl} target="_blank" rel="noreferrer">
                    Şartname
                  </a>
                ) : null}
              </div>
            ) : null}
            {entry.notes ? <p>{entry.notes}</p> : null}
          </>
        )}
      </div>
      <div className="card-actions">
        {!isEditing ? (
          <>
            {entry.status !== 'completed' ? (
              <ActionIconButton label="Tamamlandı" onClick={() => void onStatusChange(entry.id, 'completed')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </ActionIconButton>
            ) : null}
            {entry.status !== 'pending' ? (
              <ActionIconButton label="Geri al" onClick={() => void onStatusChange(entry.id, 'pending')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 14 4 9l5-5"></path>
                  <path d="M4 9h10a5 5 0 1 1 0 10h-1"></path>
                </svg>
              </ActionIconButton>
            ) : null}
            <ActionIconButton label="Düzenle" onClick={() => setIsEditing(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </ActionIconButton>
            <ActionIconButton
              label="Sil"
              variant="danger"
              onClick={() => {
                if (!window.confirm(`"${entry.title}" silinsin mi?`)) return
                void onDelete(entry.id)
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </ActionIconButton>
          </>
        ) : null}
      </div>
    </article>
  )
}

function ActionIconButton({
  label,
  onClick,
  children,
  variant,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  variant?: 'danger'
}) {
  return (
    <button
      type="button"
      className={`icon-action ${variant === 'danger' ? 'icon-action-danger' : ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function updateStage(
  index: number,
  key: 'title' | 'scheduledDate' | 'notes',
  value: string,
  setSeriesDraft: React.Dispatch<React.SetStateAction<SeriesDraft>>,
) {
  setSeriesDraft((current) => ({
    ...current,
    stages: current.stages.map((stage, stageIndex) => (stageIndex === index ? { ...stage, [key]: value } : stage)),
  }))
}

export default App
