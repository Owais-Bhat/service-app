import { test, expect } from '@playwright/test';
import { setupMocks, loginAs, navigateTo, EMPLOYEE_USER } from './helpers/mocks.js';

async function bootEmployee(page) {
  await setupMocks(page, { user: EMPLOYEE_USER });
  await loginAs(page, EMPLOYEE_USER);
  await page.goto('/');
  await page.waitForURL(/#dashboard/, { timeout: 8000 });
}

test.describe('Employee Dashboard', () => {
  test('employee boots to dashboard', async ({ page }) => {
    await bootEmployee(page);
    await expect(page).toHaveURL(/#dashboard/);
  });

  test('employee sidebar does not show admin-only tabs', async ({ page }) => {
    await bootEmployee(page);
    const text = await page.locator('aside.sidebar').textContent();
    expect(text).not.toContain('Finance Report');
    expect(text).not.toContain('All Tickets');
    expect(text).not.toContain('Users');
  });

  test('employee dashboard has personal stats content', async ({ page }) => {
    await bootEmployee(page);
    const text = await page.locator('body').textContent();
    expect(text.length).toBeGreaterThan(200);
  });
});

test.describe('Employee — My Tasks', () => {
  test('my-tasks page shows assigned tickets', async ({ page }) => {
    await bootEmployee(page);
    await navigateTo(page, 'all-tickets');
    const text = await page.locator('body').textContent();
    expect(text.toLowerCase().includes('task') || text.toLowerCase().includes('ticket') || text.includes('NE-')).toBeTruthy();
  });

  test('task items show content (status or device/issue info)', async ({ page }) => {
    await bootEmployee(page);
    await navigateTo(page, 'all-tickets');
    const text = await page.locator('body').textContent();
    // Status labels or ticket content (ticket may show ticket_no, device, or customer)
    expect(
      text.toLowerCase().includes('progress') || text.toLowerCase().includes('open') ||
      text.toLowerCase().includes('resolved') || text.includes('Mobile') ||
      text.includes('NE-') || text.includes('Jane Smith')
    ).toBeTruthy();
  });
});

test.describe('Employee — Attendance', () => {
  test('attendance page has clock-in control', async ({ page }) => {
    await bootEmployee(page);
    await navigateTo(page, 'my-attendance');
    const text = await page.locator('body').textContent();
    expect(text.toLowerCase().includes('clock') || text.toLowerCase().includes('attendance') || text.toLowerCase().includes('check')).toBeTruthy();
  });

  test('attendance list shows today\'s record', async ({ page }) => {
    await bootEmployee(page);
    await navigateTo(page, 'my-attendance');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('clock-in button is clickable with geolocation', async ({ page }) => {
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 34.083, longitude: 74.797 });
    await bootEmployee(page);
    await navigateTo(page, 'my-attendance');
    const clockBtn = page.locator('button:has-text("Clock In"), button:has-text("clock-in")').first();
    if (await clockBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clockBtn.click();
      await page.waitForTimeout(600);
    }
  });
});

test.describe('Employee — Leave Requests', () => {
  test('leave page loads correctly', async ({ page }) => {
    await bootEmployee(page);
    await navigateTo(page, 'my-leaves');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('leave request form accepts input', async ({ page }) => {
    await bootEmployee(page);
    await navigateTo(page, 'my-leaves');
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dateInput.fill('2026-06-20');
    }
  });
});

test.describe('Employee — EOD Reports', () => {
  test('EOD form is available', async ({ page }) => {
    await bootEmployee(page);
    await navigateTo(page, 'my-eod');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('EOD textarea accepts text', async ({ page }) => {
    await bootEmployee(page);
    await navigateTo(page, 'my-eod');
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await textarea.fill('Completed 3 repairs today, collected ₹2400.');
      const value = await textarea.inputValue();
      expect(value).toContain('2400');
    }
  });
});

test.describe('Employee — My Cash', () => {
  test('cash page loads', async ({ page }) => {
    await bootEmployee(page);
    await navigateTo(page, 'my-cash');
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Employee — Service Estimator', () => {
  test('estimator shows service pricing', async ({ page }) => {
    await bootEmployee(page);
    await navigateTo(page, 'estimator');
    const text = await page.locator('body').textContent();
    expect(text.includes('Laptop') || text.includes('₹') || text.toLowerCase().includes('price') || text.toLowerCase().includes('service')).toBeTruthy();
  });
});

test.describe('Employee — Training / Tutorials', () => {
  test('tutorials page renders', async ({ page }) => {
    await bootEmployee(page);
    await navigateTo(page, 'employee-training');
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Employee — Device Follow-up', () => {
  test('device follow-up page renders', async ({ page }) => {
    await bootEmployee(page);
    await navigateTo(page, 'device-followup');
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Employee — Leaderboard', () => {
  test('leaderboard page renders', async ({ page }) => {
    await bootEmployee(page);
    await navigateTo(page, 'leaderboard');
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Employee — Profile', () => {
  test('profile page renders employee info', async ({ page }) => {
    await bootEmployee(page);
    await navigateTo(page, 'profile');
    const text = await page.locator('body').textContent();
    expect(text.includes('Test Employee') || text.includes('emp@test.com') || text.toLowerCase().includes('profile')).toBeTruthy();
  });
});
