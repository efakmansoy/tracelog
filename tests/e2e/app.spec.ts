import { expect, test } from '@playwright/test'

test.describe('TraceLog app', () => {
  test('loads dashboard and creates a task in local mode', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'İşler' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Görev ekle' })).toBeVisible()

    await page.getByPlaceholder('Spor salonu, başvuru teslimi...').fill('E2E görev')
    await page.locator('input[type="date"]').first().fill('2099-01-20')
    await page.getByRole('button', { name: 'Görev ekle' }).click()

    await expect(page.getByRole('heading', { name: 'E2E görev' })).toBeVisible()
  })

  test('opens series manager and calendar sections', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('heading', { name: 'Takvim görünümü' }).click()
    await expect(page.getByText(/kayıt/i).first()).toBeVisible()

    await page.getByRole('heading', { name: 'Yarışmaları yönet' }).click()
    await expect(page.getByRole('button', { name: 'Toplu sil' }).first()).toBeVisible()
  })
})
