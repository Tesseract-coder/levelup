import { expect, type Page } from '@playwright/test';

export async function onboard(page: Page, opts: { habits?: string[] } = {}) {
  await page.goto('/');
  await page.getByLabel('I understand').check();
  await page.getByRole('button', { name: "Let's start" }).click();
  await page.getByRole('radio', { name: /Build muscle/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Age').fill('28');
  await page.getByLabel('Height').fill('165');
  await page.getByLabel('Current weight').fill('60');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Moderately active/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  for (const n of opts.habits ?? ['Strength training', 'Water', 'Journaling', 'Reading']) await page.getByRole('button', { name: n, exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click(); // activities → targets
  await page.getByRole('button', { name: 'Continue' }).click(); // targets → diet
  await page.getByRole('button', { name: 'Continue' }).click(); // diet → nutrition
  await expect(page.getByRole('heading', { name: 'Your daily targets' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click(); // nutrition
  await page.getByRole('button', { name: 'Continue' }).click(); // reminders
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Looks good' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

export async function noHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
}
