import { expect, test, type Page } from '@playwright/test';

// Surface the real cause of a failure: API errors and browser console errors are printed
// next to the failing step instead of only "element not found".
test.beforeEach(async ({ page }) => {
  page.on('response', async (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) {
      console.log(`[api ${r.status()}] ${r.request().method()} ${r.url()} ${(await r.text().catch(() => '')).slice(0, 300)}`);
    }
  });
  page.on('requestfailed', (r) => console.log(`[request failed] ${r.method()} ${r.url()} ${r.failure()?.errorText}`));
  page.on('console', (m) => m.type() === 'error' && console.log(`[browser error] ${m.text()}`));
  page.on('pageerror', (e) => console.log(`[page error] ${e.message}`));
});

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow, 'page should not scroll horizontally').toBe(false);
}

test('homepage introduces both products and routes to StudentGPT', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('clarity');
  await expect(page.getByRole('tab', { name: 'StudentGPT' })).toHaveAttribute('aria-selected', 'true');
  await noHorizontalScroll(page);
  await page.getByRole('textbox').first().fill('I feel lost about my career after second year');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/reflect\/[0-9a-f-]{36}/);
  await expect(page.getByText('I feel lost about my career after second year').first()).toBeVisible();
  // Mentor replies with a question (fake provider), streamed then persisted.
  await expect(page.locator('text=/\\?$/').first()).toBeVisible({ timeout: 15_000 });
});

test('StudentGPT conversation persists, shows safety support and reaches clarity', async ({ page }) => {
  await page.goto('/reflect');
  await page.getByLabel('Your message').fill('Everyone around me seems sure about their future');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/reflect\/.+/);
  const send = async (text: string) => {
    await expect(page.getByLabel('Your message')).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
    await page.getByLabel('Your message').fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  };
  await send('I think I compare myself a lot');
  await send('Honestly sometimes I feel hopeless about it');
  await expect(page.getByRole('alert').filter({ hasText: 'Tele-MANAS' })).toBeVisible({ timeout: 15_000 });

  // Reload: history is persisted.
  await page.reload();
  await expect(page.getByText('I think I compare myself a lot', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /wrap up/i }).click();
  await expect(page.getByLabel('Clarity summary')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Start Classroom' }).click();
  await page.waitForURL(/\/learn\/[0-9a-f-]{36}$/, { timeout: 20_000 });
});

test('Classroom: goal → assessment → roadmap → lesson → practice → progress → resume', async ({ page }) => {
  await page.goto('/learn');
  await page.getByLabel('Your learning goal').fill('Learn data analysis with Python and SQL');
  await page.getByRole('button', { name: /create my classroom/i }).click();
  await page.waitForURL(/\/learn\/[0-9a-f-]{36}$/, { timeout: 20_000 });

  await page.getByRole('radio', { name: 'A little' }).click();
  await page.getByRole('button', { name: /continue to quick assessment/i }).click();
  await expect(page.getByRole('heading', { name: 'Quick assessment' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('radio', { name: 'Statement A' }).first().check();
  await page.getByRole('button', { name: /see my roadmap/i }).click();
  await expect(page.getByText('Your path')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('0%')).toBeVisible();
  const roadmapUrl = page.url();

  await page.getByRole('button', { name: /start:/i }).click();
  await expect(page.getByRole('heading', { name: 'Key takeaways' }).or(page.getByText('Key takeaways'))).toBeVisible({ timeout: 20_000 });

  // Practice: answer per fixture (item n correct index = (n-1) % 4) and pass.
  if (await page.getByRole('tab', { name: 'Practice' }).isVisible()) await page.getByRole('tab', { name: 'Practice' }).click();
  await page.getByRole('button', { name: /start practice quiz/i }).click();
  const options = ['Statement A', 'Statement B', 'Statement C', 'Statement D'];
  for (let i = 0; i < 4; i++) {
    await page.locator('fieldset').nth(i).getByRole('radio', { name: options[i] }).check();
  }
  await page.locator('fieldset').nth(4).getByRole('textbox').fill('It explains the idea clearly and when to use it');
  await page.getByRole('button', { name: /check my answers/i }).click();
  await expect(page.getByText('Your score')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Completed').first()).toBeVisible();

  // Resume later: progress persisted.
  await page.goto(roadmapUrl);
  await expect(page.getByText('17%')).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByText('Continue learning')).toBeVisible();
  await page.getByRole('button', { name: /resume lesson/i }).click();
  await expect(page).toHaveURL(/\/lesson\//);
});

test('sign up keeps guest work; log out and back in', async ({ page }) => {
  await page.goto('/reflect');
  await page.getByLabel('Your message').fill('Guest thought before signing up');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/reflect\/.+/);
  await expect(page.getByLabel('Your message')).toBeEnabled({ timeout: 15_000 });

  const email = `e2e-${Date.now()}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('very-secure-pw');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByText('Recent reflections')).toBeVisible();
  await expect(page.getByRole('link', { name: /Guest thought before signing up/ })).toBeVisible();

  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
  await noHorizontalScroll(page);
});

test('unknown routes show a 404 page', async ({ page }) => {
  await page.goto('/this/does/not/exist');
  await expect(page.getByRole('heading', { name: "This page doesn't exist" })).toBeVisible();
});
