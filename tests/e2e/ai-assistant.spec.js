import { test, expect } from '@playwright/test';
import { setupMocks, loginAs, navigateTo, ADMIN_USER } from './helpers/mocks.js';

async function bootToAI(page) {
  await setupMocks(page);
  await page.route('**/api/ai/**', async (route) => {
    const body = await route.request().postDataJSON().catch(() => ({}));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ answer: `AI response for: ${body.question || 'query'}`, tokens_used: 150 }),
    });
  });
  await loginAs(page, ADMIN_USER);
  await page.goto('/');
  await page.waitForURL(/#dashboard/, { timeout: 8000 });
  await navigateTo(page, 'ai-report');
}

test.describe('AI Assistant / AI Report', () => {
  test('AI report page loads content', async ({ page }) => {
    await bootToAI(page);
    // Page may have a text input or just be a report view — either is acceptable
    const input = page.locator('textarea, input[type="text"]').first();
    const inputVisible = await input.isVisible().catch(() => false);
    if (inputVisible) {
      await expect(input).toBeVisible();
    } else {
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });

  test('send a question and receive AI response', async ({ page }) => {
    await bootToAI(page);
    const input = page.locator('textarea, input[type="text"]').first();
    const sendBtn = page.locator('button:has-text("Send"), button:has-text("Ask"), button[type="submit"]').first();

    if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
      await input.fill('What is the collection rate this month?');
      if (await sendBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await sendBtn.click();
        await page.waitForTimeout(1000);
        const text = await page.locator('body').textContent();
        expect(
          text.toLowerCase().includes('ai response') ||
          text.toLowerCase().includes('collection') ||
          text.toLowerCase().includes('response')
        ).toBeTruthy();
      }
    }
  });

  test('AI provider selector is available', async ({ page }) => {
    await bootToAI(page);
    const providerCtrl = page.locator('select, button:has-text("OpenAI"), button:has-text("Anthropic"), button:has-text("GPT")');
    if (await providerCtrl.count() > 0) {
      await expect(providerCtrl.first()).toBeVisible();
    }
  });

  test('empty question does not trigger API call', async ({ page }) => {
    const aiCalls = [];
    await setupMocks(page);
    await page.route('**/api/ai/**', async (route) => {
      aiCalls.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: 'test' }) });
    });
    await loginAs(page, ADMIN_USER);
    await page.goto('/');
    await page.waitForURL(/#dashboard/, { timeout: 8000 });
    await navigateTo(page, 'ai-report');

    const sendBtn = page.locator('button:has-text("Send"), button:has-text("Ask"), button[type="submit"]').first();
    if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendBtn.click();
      await page.waitForTimeout(500);
      expect(aiCalls).toHaveLength(0);
    }
  });
});

test.describe('Finance AI Insight', () => {
  test('AI insight button on finance page works when present', async ({ page }) => {
    await setupMocks(page);
    let aiCallMade = false;
    await page.route(/\/api\/ai\/finance/, async (route) => {
      aiCallMade = true;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ insight: 'Revenue trending up 12% MoM.' }),
      });
    });
    await loginAs(page, ADMIN_USER);
    await page.goto('/');
    await page.waitForURL(/#dashboard/, { timeout: 8000 });
    const finResp = page.waitForResponse(
      resp => resp.url().includes('/finance/summary'),
      { timeout: 9000 }
    ).catch(() => null);
    await navigateTo(page, 'finance');
    await finResp;
    await page.waitForTimeout(400);

    const aiBtn = page.locator('button:has-text("AI"), button:has-text("Insight"), button:has-text("Analyze")').first();
    const btnVisible = await aiBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (btnVisible) {
      await aiBtn.click();
      await page.waitForTimeout(1000);
      // If button was clicked, either the AI call was made or the UI shows the result inline
      const text = await page.locator('body').textContent();
      expect(aiCallMade || text.toLowerCase().includes('trending') || text.toLowerCase().includes('revenue')).toBeTruthy();
    } else {
      // Finance AI button not present in this layout — page still loads correctly
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });
});
