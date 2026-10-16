import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const SCREENS: [string, string][] = [
  ['/', 'Today'],
  ['/insights', 'Insights'],
  ['/habits', 'Habits & goals'],
  ['/log', 'Food diary'],
  ['/goals', 'Goals & plan'],
  ['/profile', 'Profile'],
];

for (const scheme of ['light', 'dark'] as const) {
  test(`main screens have no serious accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/?demo=1');
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 20_000 });
    for (const [path, heading] of SCREENS) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
      await page.waitForTimeout(300);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${path}: ${v.id} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    }
    await page.goto('/summary/day/' + new Date().toISOString().slice(0, 10));
    await expect(page.getByText('What went great')).toBeVisible();
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  });
}

test('onboarding, food review and sheets have no serious accessibility violations', async ({ page }) => {
  const check = async (where: string) => {
    await page.waitForTimeout(300);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where}: ${v.id} ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  };
  await page.goto('/');
  await check('welcome');
  await page.getByLabel('I understand').check();
  await page.getByRole('button', { name: "Let's start" }).click();
  await check('goal');
  await page.getByRole('radio', { name: /Lose fat/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await check('body');
  await page.getByLabel('Age').fill('30');
  await page.getByLabel('Height').fill('170');
  await page.getByLabel('Current weight').fill('70');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await page.getByRole('button', { name: 'Journaling', exact: true }).click();
  await check('activities');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue' }).click();
  await check('nutrition');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await check('plan');
  await page.getByRole('button', { name: 'Looks good' }).click();
  await page.getByRole('button', { name: 'Log (quick add)' }).click();
  await check('quick add sheet');
  await page.getByRole('button', { name: /Log water/ }).click();
  await check('water sheet');
  await page.goto('/food/new');
  await page.getByLabel('What did you eat?').fill('2 idli, sambar, chai');
  await page.getByRole('button', { name: 'Break it down' }).click();
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
  await check('food review');
});
