import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const repositoryMock = vi.hoisted(() => ({
  bootstrapData: {
    mode: 'local' as const,
    session: { userId: 'local-user', email: 'demo@example.com' },
    entries: [
      {
        id: 'task-1',
        title: 'İlk görev',
        notes: 'not',
        scheduledDate: '2099-01-10',
        status: 'pending' as const,
        type: 'task' as const,
        seriesId: null,
        recurrence: 'none' as const,
        sortOrder: 0,
        syncState: 'synced' as const,
        createdAt: '2026-01-01T10:00:00.000Z',
      },
    ],
    series: [
      {
        id: 'series-1',
        title: 'Hackathon',
        notes: '',
        siteUrl: '',
        briefUrl: '',
        createdAt: '2026-01-01T10:00:00.000Z',
      },
    ],
    settings: {
      dailySummaryTime: '09:00',
      pushEnabled: false,
      timezone: 'Europe/Istanbul',
      displayName: 'Demo',
    },
    syncPendingCount: 0,
    isOffline: false,
  },
  createSeries: vi.fn().mockResolvedValue(undefined),
  createTask: vi.fn().mockResolvedValue(undefined),
  deleteEntry: vi.fn().mockResolvedValue(undefined),
  deleteSeries: vi.fn().mockResolvedValue(undefined),
  getBootstrapData: vi.fn(),
  getPushSupport: vi.fn(() => ({ supported: true, reason: '' })),
  reorderSeriesStages: vi.fn().mockResolvedValue(undefined),
  signInWithMagicLink: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
  subscribeToPush: vi.fn().mockResolvedValue({ subscribed: true }),
  updateEntry: vi.fn().mockResolvedValue(undefined),
  updateEntryStatus: vi.fn().mockResolvedValue(undefined),
  updateSeries: vi.fn().mockResolvedValue(undefined),
  updateSettings: vi.fn().mockResolvedValue(undefined),
  verifyLocalPushDelivery: vi.fn().mockResolvedValue(undefined),
  watchAuth: vi.fn(() => () => undefined),
}))

vi.mock('./lib/appRepository', () => repositoryMock)

import App from './App'

describe('App integration', () => {
  beforeEach(() => {
    Object.values(repositoryMock).forEach((value) => {
      if (typeof value === 'function' && 'mockClear' in value) {
        value.mockClear()
      }
    })
    repositoryMock.getBootstrapData.mockResolvedValue(repositoryMock.bootstrapData)
    repositoryMock.watchAuth.mockReturnValue(() => undefined)
  })

  afterEach(() => {
    cleanup()
  })

  it('creates task with selected recurrence', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><App /></MemoryRouter>)

    await screen.findByRole('heading', { name: 'Görev ekle' })
    await user.type(screen.getByPlaceholderText('Spor salonu, başvuru teslimi...'), 'Yeni görev')
    await user.type(screen.getAllByLabelText('Tarih')[0], '2099-01-15')
    await user.selectOptions(screen.getByDisplayValue('Tek sefer'), 'weekly')
    await user.click(screen.getByRole('button', { name: 'Görev ekle' }))

    await waitFor(() =>
      expect(repositoryMock.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Yeni görev',
          recurrence: 'weekly',
        }),
      ),
    )
  })

  it('does not save settings while typing and saves on explicit action', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><App /></MemoryRouter>)

    await screen.findByRole('heading', { name: 'Görev ekle' })
    await user.click(screen.getByRole('heading', { name: 'Bildirim ve kurulum' }))
    const timezoneInput = await screen.findByDisplayValue('Europe/Istanbul')
    await user.clear(timezoneInput)
    await user.type(timezoneInput, 'Europe/Berlin')

    expect(repositoryMock.updateSettings).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Ayarları kaydet' }))

    await waitFor(() =>
      expect(repositoryMock.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ timezone: 'Europe/Berlin' }),
      ),
    )
  })

  it('shows url validation before creating series', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><App /></MemoryRouter>)

    await screen.findByRole('heading', { name: 'Görev ekle' })
    await user.click(screen.getByRole('heading', { name: 'Yarışma ekle' }))
    await user.type(screen.getByPlaceholderText('Yarışma 2026'), 'Bozuk Yarışma')
    await user.type(screen.getAllByPlaceholderText('https://...')[0], 'foo')
    await user.type(screen.getByPlaceholderText('Ön eleme'), 'Ön eleme')
    await user.type(screen.getAllByLabelText('Tarih')[1], '2099-01-12')
    await user.click(screen.getByRole('button', { name: 'Yarışmayı kaydet' }))

    expect(repositoryMock.createSeries).not.toHaveBeenCalled()
  })
})
