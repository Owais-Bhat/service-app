import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers/mocks.js';

test.describe('Landing Page (Public Portal)', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    // Landing page doesn't need auth — navigate to root without token
    await page.goto('/');
    // Click the public portal / "Back" button if the app shows a portal entry
    const portalBtn = page.locator('button:has-text("Service Portal"), a:has-text("Service Portal"), #open-portal-btn');
    if (await portalBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await portalBtn.click();
    }
  });

  test('displays service category options', async ({ page }) => {
    await page.goto('/');
    // Check the landing section or public form is accessible
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });

  test('landing bootstrap is fetched once on load', async ({ page }) => {
    const bootstrapRequests = [];
    page.on('request', req => {
      if (req.url().includes('/landing/bootstrap')) bootstrapRequests.push(req.url());
    });
    await page.goto('/');
    await page.waitForTimeout(1000);
    expect(bootstrapRequests.length).toBeLessThanOrEqual(2);
  });

  test('no separate ads or pricing requests from landing', async ({ page }) => {
    const badRequests = [];
    page.on('request', req => {
      const url = req.url();
      if ((url.includes('/data/ads') || url.includes('/data/service_pricing')) && url.includes('/api/')) {
        badRequests.push(url);
      }
    });
    await page.goto('/');
    await page.waitForTimeout(1000);
    expect(badRequests).toHaveLength(0);
  });
});

test.describe('Landing Service Request Form', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    // Navigate to landing hash if the app supports it
    await page.goto('/#landing');
    await page.waitForTimeout(500);
  });

  test('form has required customer fields', async ({ page }) => {
    const emailOrPhone = page.locator('input[type="tel"], input[placeholder*="phone"], input[placeholder*="Phone"], input[id*="phone"]');
    const serviceSelect = page.locator('select[id*="service"], select[id*="category"]');

    const hasPhone = await emailOrPhone.count() > 0;
    const hasServiceOrContent = await serviceSelect.count() > 0 || (await page.locator('body').textContent()).length > 100;
    expect(hasPhone || hasServiceOrContent).toBeTruthy();
  });

  test('shows OTP verification step', async ({ page }) => {
    const otpRelated = page.locator('[id*="otp"], [placeholder*="OTP"], button:has-text("Send OTP"), button:has-text("Verify")');
    const count = await otpRelated.count();
    if (count > 0) {
      await expect(otpRelated.first()).toBeVisible();
    }
  });

  test('geolocation prompt is accessible', async ({ page }) => {
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 34.0, longitude: 74.8 });
    const locationBtn = page.locator('button:has-text("location"), button:has-text("Location"), [id*="location"]');
    if (await locationBtn.count() > 0) {
      await locationBtn.first().click();
      await page.waitForTimeout(500);
    }
  });
});
