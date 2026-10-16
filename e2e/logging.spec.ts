import { expect, test } from '@playwright/test';
import { onboard } from './helpers';

const DAY =
  'Breakfast: 2 boiled eggs, 2 slices of brown bread with peanut butter, black coffee. Lunch: 2 rotis, 1 katori dal, mixed veg sabzi, curd. Snack: banana and a handful of almonds. Dinner: paneer bhurji and 1 roti.';

test('check-type habit completes in one tap and can be undone', async ({ page }) => {
  await onboard(page);
  const btn = page.getByRole('button', { name: 'Journaling: mark done' });
  await btn.click(); // 1 tap
  await expect(page.getByRole('button', { name: 'Journaling: done, tap to undo' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('img', { name: /Habits: 1 of/ })).toBeVisible();
  await page.getByRole('button', { name: 'Journaling: done, tap to undo' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Journaling: done, tap to undo' })).toBeVisible();
});

test('a full day of food becomes an editable per-item breakdown with totals vs targets', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Log (quick add)' }).click();
  await page.getByRole('button', { name: /Log food/ }).click();
  await page.getByLabel('What did you eat?').fill(DAY);
  await page.getByRole('button', { name: 'Break it down' }).click();
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
  await expect(page.getByText(/Estimates\./)).toBeVisible();
  for (const meal of ['Breakfast', 'Lunch', 'Snacks', 'Dinner']) await expect(page.getByRole('heading', { name: meal })).toBeVisible();
  await expect(page.locator('li', { hasText: 'Boiled egg' }).getByText(/kcal/)).toBeVisible();
  await expect(page.getByText('Day total with these')).toBeVisible();
  // edit a quantity → totals update live
  const save = page.getByRole('button', { name: /^Save 12 items · / });
  const before = await save.innerText();
  await page.getByRole('group', { name: 'Quantity of Banana' }).getByRole('button', { name: 'More' }).click();
  await expect(save).not.toHaveText(before);
  // delete an item
  await page.getByRole('button', { name: 'Delete Black coffee' }).click();
  await page.getByRole('button', { name: /^Save 11 items/ }).click();
  await expect(page).toHaveURL(/\/log/);
  await expect(page.getByRole('heading', { name: 'Food diary' })).toBeVisible();
  await expect(page.getByText('Paneer bhurji')).toBeVisible();
});

test('workout logging with calories burned estimate', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: /Strength training/ }).last().click();
  await expect(page.getByText(/≈ \d+ kcal/)).toBeVisible();
  await page.getByRole('button', { name: 'Log workout' }).click();
  await expect(page.getByRole('img', { name: /Active: 45 of/ })).toBeVisible();
});

test('system back closes a bottom sheet instead of leaving the screen', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Log (quick add)' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});
