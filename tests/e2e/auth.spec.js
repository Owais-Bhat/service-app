import { test, expect } from '@playwright/test';
import { setupMocks, ADMIN_USER, EMPLOYEE_USER, MOCK_TOKEN } from './helpers/mocks.js';

// The landing page is always shown at '/' for unauthenticated users.
// The auth form appears when the "Staff Login" button (.srf-staff-btn) is clicked.
async function openAuthForm(page) {
  await page.waitForSelector('.srf-staff-btn', { timeout: 8000 });
  await page.click('.srf-staff-btn');
  await page.waitForSelector('#email', { timeout: 6000 });
}

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await page.goto('/');
  });

  test('landing page loads without auth', async ({ page }) => {
    await expect(page.locator('.srf-staff-btn')).toBeVisible({ timeout: 8000 });
  });

  test('clicking Staff Login shows auth form', async ({ page }) => {
    await openAuthForm(page);
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#submit-btn')).toContainText('Sign In');
  });

  test('admin login navigates to dashboard', async ({ page }) => {
    await openAuthForm(page);
    await page.fill('#email', ADMIN_USER.email);
    await page.fill('#password', 'Admin@123');
    await page.click('#submit-btn');
    await expect(page).toHaveURL(/#dashboard/, { timeout: 8000 });
    await expect(page.locator('#app')).not.toContainText('Sign In');
  });

  test('employee login navigates to dashboard', async ({ page }) => {
    await setupMocks(page, { user: EMPLOYEE_USER });
    await page.goto('/');
    await openAuthForm(page);
    await page.fill('#email', EMPLOYEE_USER.email);
    await page.fill('#password', 'Emp@123');
    await page.click('#submit-btn');
    await expect(page).toHaveURL(/#dashboard/, { timeout: 8000 });
  });

  test('invalid credentials shows error message', async ({ page }) => {
    await openAuthForm(page);
    await page.fill('#email', 'wrong@example.com');
    await page.fill('#password', 'WrongPassword');
    await page.click('#submit-btn');
    await expect(page.locator('#auth-error')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#auth-error')).toContainText('Invalid');
  });

  test('toggle to signup mode shows extra fields', async ({ page }) => {
    await openAuthForm(page);
    await page.click('#toggle-mode');
    await expect(page.locator('#full_name')).toBeVisible();
    await expect(page.locator('#reg_key')).toBeVisible();
    await expect(page.locator('#submit-btn')).toContainText('Create Account');
  });

  test('signup with access key creates account and logs in', async ({ page }) => {
    await openAuthForm(page);
    await page.click('#toggle-mode');
    await page.fill('#full_name', 'New Staff Member');
    await page.fill('#reg_key', 'STAFF-KEY-2024');
    await page.fill('#email', 'new@test.com');
    await page.fill('#password', 'NewPass@123');
    await page.click('#submit-btn');
    await expect(page).toHaveURL(/#dashboard/, { timeout: 8000 });
  });

  test('password visibility toggle works', async ({ page }) => {
    await openAuthForm(page);
    const passwordInput = page.locator('#password');
    const toggleBtn = page.locator('[data-target="password"]');
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await toggleBtn.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await toggleBtn.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('access key visibility toggle works on signup', async ({ page }) => {
    await openAuthForm(page);
    await page.click('#toggle-mode');
    const regKeyInput = page.locator('#reg_key');
    const toggleBtn = page.locator('[data-target="reg_key"]');
    await expect(regKeyInput).toHaveAttribute('type', 'password');
    await toggleBtn.click();
    await expect(regKeyInput).toHaveAttribute('type', 'text');
  });

  test('theme toggle on auth page persists to localStorage', async ({ page }) => {
    await openAuthForm(page);
    const themeBtn = page.locator('.theme-toggle-btn');
    const before = await page.evaluate(() => localStorage.getItem('theme'));
    await themeBtn.click();
    const after = await page.evaluate(() => localStorage.getItem('theme'));
    expect(before).not.toEqual(after);
  });

  test('back button from auth returns to landing page', async ({ page }) => {
    await openAuthForm(page);
    const backBtn = page.locator('#auth-back-btn');
    if (await backBtn.isVisible()) {
      await backBtn.click();
      await expect(page.locator('.srf-staff-btn')).toBeVisible({ timeout: 4000 });
    }
  });

  test('unauthenticated user sees landing not dashboard', async ({ page }) => {
    await expect(page.locator('.srf-staff-btn')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#app')).not.toContainText('All Tickets');
  });

  test('JWT token stored in localStorage after login', async ({ page }) => {
    await openAuthForm(page);
    await page.fill('#email', ADMIN_USER.email);
    await page.fill('#password', 'Admin@123');
    await page.click('#submit-btn');
    await expect(page).toHaveURL(/#dashboard/, { timeout: 8000 });
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBe(MOCK_TOKEN);
  });
});
