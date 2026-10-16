import { expect, test } from '@playwright/test';
import { noHorizontalScroll } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 20_000 });
});

test('daily summary shows score, wins, misses, improvements and a next focus', async ({ page }) => {
  await page.getByRole('link', { name: 'Summary' }).click();
  await expect(page.getByRole('img', { name: /Consistency score \d+ out of 100/ })).toBeVisible();
  for (const h of ['What went great', 'What was missed', 'What to improve']) await expect(page.getByRole('heading', { name: h })).toBeVisible();
  await expect(page.getByText('Tomorrow’s focus')).toBeVisible();
  await page.getByRole('button', { name: /How it was calculated/ }).click();
  await expect(page.getByText(/weight 30/).first()).toBeVisible();
});

test('weekly summary focus turns into a habit with one tap', async ({ page }) => {
  await page.goto('/summary/week/' + new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
  await expect(page.getByText('Next week’s focus')).toBeVisible();
  const accept = page.getByRole('button', { name: /Make it a habit|Accept this focus/ });
  await accept.click();
  await expect(page.getByText(/Added to your habits|Focus set/)).toBeVisible();
});

for (const width of [360, 390, 430]) {
  test(`insights render all charts at ${width}px with 60 days of data`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.getByRole('link', { name: 'Insights' }).click();
    for (const t of ['Calories in vs target', 'Macro split', 'Weight trend', 'Workout minutes per week', 'Habit completion', 'Sleep']) {
      await expect(page.getByRole('heading', { name: t, exact: true })).toBeVisible();
    }
    expect(await page.locator('.recharts-surface').count()).toBeGreaterThanOrEqual(6);
    await page.getByRole('radio', { name: '90D' }).click();
    await expect(page.getByText('Consistency score')).toBeVisible();
    await noHorizontalScroll(page);
    await page.getByRole('link', { name: 'Today' }).click();
    await noHorizontalScroll(page);
  });
}
