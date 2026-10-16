import { expect, test } from '@playwright/test';
import { onboard } from './helpers';

test('new user finishes onboarding and sees a personalized plan', async ({ page }) => {
  const start = Date.now();
  await onboard(page);
  expect(Date.now() - start).toBeLessThan(120_000);
  // plan carried into Today: rings show targets
  await expect(page.getByRole('img', { name: /Calories: 0 of \d+/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /Protein: 0 of 120 g/ })).toBeVisible(); // 2.0 g/kg × 60 kg
  await page.goto('/goals');
  await expect(page.getByText('Build muscle')).toBeVisible();
});

test('custom activity can be added during onboarding', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('I understand').check();
  await page.getByRole('button', { name: "Let's start" }).click();
  await page.getByRole('radio', { name: /Discipline/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Age').fill('35');
  await page.getByLabel('Height').fill('180');
  await page.getByLabel('Current weight').fill('78');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Add your own' }).click();
  await page.getByLabel('Name').fill('Guitar practice');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Guitar practice')).toBeVisible();
  await page.getByRole('button', { name: 'Looks good' }).click();
  await expect(page.getByRole('button', { name: /Guitar practice: mark done/ })).toBeVisible();
});

test('very low calorie target shows a gentle caution', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('I understand').check();
  await page.getByRole('button', { name: "Let's start" }).click();
  await page.getByRole('radio', { name: /Lose fat/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Age').fill('30');
  await page.getByLabel('Height').fill('160');
  await page.getByLabel('Current weight').fill('58');
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Calories (kcal)').fill('900');
  await expect(page.getByText(/below the commonly recommended minimum/)).toBeVisible();
});
