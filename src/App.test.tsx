import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimelineCard } from './App'
import type { AppEntry, AppSeries } from './types'

afterEach(() => {
  cleanup()
})

const entry: AppEntry = {
  id: 'entry-1',
  title: 'Sunum hazirla',
  notes: 'Son kontrol',
  scheduledDate: '2099-01-10',
  status: 'pending',
  type: 'task',
  seriesId: 'series-1',
  createdAt: '2026-01-01T10:00:00.000Z',
}

const series: AppSeries = {
  id: 'series-1',
  title: 'Hackathon',
  notes: '',
  siteUrl: 'https://hackathon.example',
  briefUrl: 'https://hackathon.example/brief.pdf',
  createdAt: '2026-01-01T10:00:00.000Z',
}

describe('TimelineCard', () => {
  it('renders competition title in the header area', () => {
    render(
      <TimelineCard
        entry={entry}
        series={series}
        onStatusChange={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.getByText('Hackathon')).toBeInTheDocument()
    expect(screen.getByText('Sunum hazirla')).toBeInTheDocument()
  })

  it('triggers complete action from compact icon button', async () => {
    const user = userEvent.setup()
    const onStatusChange = vi.fn().mockResolvedValue(undefined)

    render(
      <TimelineCard
        entry={entry}
        series={null}
        onStatusChange={onStatusChange}
      />,
    )

    await user.click(screen.getAllByRole('button', { name: 'Tamamlandı' })[0])

    expect(onStatusChange).toHaveBeenCalledWith('entry-1', 'completed')
  })
})
