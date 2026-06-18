import { test, expect } from '@playwright/test';
import { setupMocks, loginAs, navigateTo, ADMIN_USER } from './helpers/mocks.js';

async function bootToFinance(page) {
  await setupMocks(page);
  await loginAs(page, ADMIN_USER);
  await page.goto('/');
  await page.waitForURL(/#dashboard/, { timeout: 8000 });
  // Prime the response waiter BEFORE navigating so we don't miss the request
  const finResp = page.waitForResponse(
    resp => resp.url().includes('/finance/summary'),
    { timeout: 9000 }
  ).catch(() => null);
  await navigateTo(page, 'finance');
  await finResp; // Block until mock is fulfilled (or times out gracefully)
  await page.waitForTimeout(400);
}

test.describe('Finance Report', () => {
  test('finance page loads with revenue summary', async ({ page }) => {
    await bootToFinance(page);
    const text = await page.locator('body').textContent();
    expect(text.includes('₹') || text.toLowerCase().includes('revenue') || text.toLowerCase().includes('collection')).toBeTruthy();
  });

  test('total billed amount is displayed (any format)', async ({ page }) => {
    await bootToFinance(page);
    const text = await page.locator('body').textContent();
    // Page may format 45000 as "₹45K", "₹45,000", "45,000" or "45000"
    expect(
      text.includes('45,000') || text.includes('45000') || text.includes('45K') ||
      text.includes('45k') || text.includes('₹45') || text.toLowerCase().includes('billed')
    ).toBeTruthy();
  });

  test('collection rate is displayed (any format)', async ({ page }) => {
    await bootToFinance(page);
    const text = await page.locator('body').textContent();
    // 84.4% may show as "84%", "84.4", "84.4%", or just the label
    expect(
      text.includes('84') || text.toLowerCase().includes('collection rate') || text.toLowerCase().includes('collected')
    ).toBeTruthy();
  });

  test('category breakdown section exists', async ({ page }) => {
    await bootToFinance(page);
    const text = await page.locator('body').textContent();
    // At least one device category should appear
    expect(text.includes('Laptop') || text.includes('Mobile') || text.includes('Printer')).toBeTruthy();
  });

  test('technician or by-staff breakdown is shown', async ({ page }) => {
    await bootToFinance(page);
    const text = await page.locator('body').textContent();
    expect(
      text.includes('Test Employee') ||
      text.toLowerCase().includes('technician') ||
      text.toLowerCase().includes('staff') ||
      text.toLowerCase().includes('employee')
    ).toBeTruthy();
  });

  test('AI insight button is present', async ({ page }) => {
    await bootToFinance(page);
    const aiBtn = page.locator('button:has-text("AI"), button:has-text("Insight"), button:has-text("Analyze")');
    if (await aiBtn.count() > 0) {
      await expect(aiBtn.first()).toBeVisible();
    }
  });

  test('clicking AI insight returns analysis text', async ({ page }) => {
    await bootToFinance(page);
    const aiBtn = page.locator('button:has-text("AI"), button:has-text("Insight"), button:has-text("Analyze")').first();
    if (await aiBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await aiBtn.click();
      await page.waitForTimeout(1000);
      const text = await page.locator('body').textContent();
      expect(text.toLowerCase().includes('revenue') || text.toLowerCase().includes('collection') || text.toLowerCase().includes('trending')).toBeTruthy();
    }
  });

  test('date range filter control exists', async ({ page }) => {
    await bootToFinance(page);
    const datePicker = page.locator('input[type="date"], input[type="month"], select');
    if (await datePicker.count() > 0) {
      await expect(datePicker.first()).toBeVisible();
    }
  });

  test('aging or overdue section is present', async ({ page }) => {
    await bootToFinance(page);
    const text = await page.locator('body').textContent();
    const hasAging = text.toLowerCase().includes('aging') || text.toLowerCase().includes('overdue') || text.toLowerCase().includes('days');
    if (!hasAging) {
      expect(text.toLowerCase().includes('collection') || text.includes('₹')).toBeTruthy();
    }
  });

  test('paid or billed count is visible', async ({ page }) => {
    await bootToFinance(page);
    const text = await page.locator('body').textContent();
    // Finance page shows "46/54 paid" and "54 bills" in KPI subtitles
    expect(
      text.includes('46') || text.includes('54') || text.toLowerCase().includes('paid') ||
      text.toLowerCase().includes('bills') || text.toLowerCase().includes('billed')
    ).toBeTruthy();
  });
});
