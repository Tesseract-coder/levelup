import { expect, test, type Page } from '@playwright/test';
import { noHorizontalScroll, onboard } from './helpers';

const SHOTS = process.env.SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

async function startChestDay(page: Page) {
  await page.getByRole('button', { name: 'Start strength workout' }).click();
  await expect(page.getByRole('heading', { name: 'What are you training today?' })).toBeVisible();
  await page.getByRole('group', { name: 'Muscle groups' }).getByRole('button', { name: 'Chest' }).click();
  await shot(page, '01-day-picker');
  await page.getByRole('button', { name: /^Start Chest day/ }).click();
  await expect(page.getByRole('heading', { name: 'Add exercises' })).toBeVisible();
}

test('live chest day: pick exercises, log sets with rest timer, finish', async ({ page }) => {
  await onboard(page);
  await startChestDay(page);
  await shot(page, '02-picker');
  for (const name of ['Barbell Bench Press', 'Incline Dumbbell Press', 'Cable Fly (Mid)']) await page.getByRole('button', { name, exact: false }).first().click();
  await page.getByRole('button', { name: 'Add 3 exercises' }).click();
  await expect(page.getByRole('heading', { name: 'Chest day' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Barbell Bench Press' })).toBeVisible();

  const bench = page.getByRole('region', { name: 'Barbell Bench Press' });
  await bench.getByLabel('Barbell Bench Press set 1 kg').fill('60');
  await bench.getByLabel('Barbell Bench Press set 1 Reps').fill('8');
  await shot(page, '03-set-entry');
  await bench.getByRole('button', { name: 'Mark Barbell Bench Press set 1 done' }).click();
  await expect(page.getByRole('timer', { name: /Rest timer/ })).toBeVisible();
  // second set: ghost values from set 1 are accepted with one tap
  await bench.getByRole('button', { name: 'Mark Barbell Bench Press set 2 done' }).click();
  await expect(bench.getByLabel('Barbell Bench Press set 2 kg')).toHaveValue('60');
  // stepper on the active row
  await bench.getByLabel('Barbell Bench Press set 3 kg').click();
  await bench.getByRole('button', { name: 'Increase kg by 2.5' }).click();
  await expect(bench.getByLabel('Barbell Bench Press set 3 kg')).toHaveValue('62.5');
  await bench.getByLabel('Barbell Bench Press set 3 Reps').fill('6');
  await shot(page, '04-live');
  await page.getByRole('button', { name: '15 seconds more rest' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('timer', { name: /Rest timer/ })).toHaveCount(0);
  await noHorizontalScroll(page);

  // dumbbells are per hand
  await expect(page.getByRole('region', { name: 'Incline Dumbbell Press' }).getByText(/kg per hand/)).toBeVisible();

  await page.getByRole('button', { name: 'Finish' }).click();
  // set 3 has numbers but isn't ticked
  await expect(page.getByRole('heading', { name: '1 set not ticked off' })).toBeVisible();
  await page.getByRole('button', { name: 'No, leave them out' }).click();
  await expect(page.getByRole('heading', { name: /Chest day done/ })).toBeVisible();
  await shot(page, '05-summary');
  await expect(page.getByText(/960 kg/)).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByText(/Strength training/).first()).toBeVisible();
});

test('an in-progress workout survives a reload and can be resumed', async ({ page }) => {
  await onboard(page);
  await startChestDay(page);
  await page.getByRole('button', { name: 'Push-up', exact: false }).first().click();
  await page.getByRole('button', { name: 'Add 1 exercise' }).click();
  const pu = page.getByRole('region', { name: 'Push-up' });
  await pu.getByLabel('Push-up set 1 Reps').fill('18');
  await pu.getByRole('button', { name: 'Mark Push-up set 1 done' }).click();
  await page.waitForTimeout(400); // autosave debounce
  await page.reload();
  await expect(page.getByRole('region', { name: 'Push-up' }).getByLabel('Push-up set 1 Reps')).toHaveValue('18');
  await page.getByRole('button', { name: /Minimise workout/ }).click();
  await expect(page.getByRole('button', { name: /Resume workout/ })).toBeVisible();
  await page.getByRole('button', { name: /Resume workout/ }).click();
  await expect(page.getByRole('heading', { name: 'Chest day' })).toBeVisible();
});

test('quick-log a past workout', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Start strength workout' }).click();
  await page.getByRole('button', { name: 'Legs' }).first().click();
  await page.getByRole('radio', { name: 'Log a past workout' }).click();
  await page.getByRole('button', { name: /^Start Legs day/ }).click();
  await page.getByRole('button', { name: 'Leg Press', exact: false }).first().click();
  await page.getByRole('button', { name: 'Add 1 exercise' }).click();
  const lp = page.getByRole('region', { name: 'Leg Press' });
  await lp.getByLabel('Leg Press set 1 kg').fill('120');
  await lp.getByLabel('Leg Press set 1 Reps').fill('10');
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: /Legs day done/ })).toBeVisible();
  await expect(page.getByText('60', { exact: true })).toBeVisible(); // duration in minutes
});

test.describe('progress with 12 weeks of data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?demo=1');
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 20_000 });
  });

  test('strength dashboard and exercise detail render at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.getByRole('link', { name: 'Insights' }).click();
    await page.getByRole('radio', { name: 'Strength' }).click();
    for (const t of ['Workouts per week', 'Hard sets per muscle', "This week's muscles", 'Balance', /Volume per week/, /Top improving lifts/]) {
      await expect(page.getByRole('heading', { name: t }).first()).toBeVisible();
    }
    await shot(page, '06-strength-insights');
    await noHorizontalScroll(page);
    await page.getByRole('link', { name: /Barbell Bench Press/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Barbell Bench Press' })).toBeVisible();
    await expect(page.getByText('Best est. 1RM')).toBeVisible();
    await expect(page.locator('.recharts-surface')).toHaveCount(1);
    await page.getByRole('radio', { name: 'e1RM' }).click();
    await page.getByRole('radio', { name: 'All' }).click();
    await shot(page, '07-exercise-detail');
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
    await noHorizontalScroll(page);
  });

  test('kg ↔ lb display switch keeps stored values', async ({ page }) => {
    await page.goto('/exercises/barbell_bench_press');
    const kg = await page.getByText(/^\d+(\.\d+)? kg$/).first().innerText();
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Body & preferences' }).click();
    await page.getByRole('radio', { name: 'lb · ft/in' }).click();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await page.goto('/exercises/barbell_bench_press');
    const lb = await page.getByText(/^\d+(\.\d+)? lb$/).first().innerText();
    expect(Math.round(parseFloat(lb) * 0.45359237)).toBe(Math.round(parseFloat(kg)));
  });
});
