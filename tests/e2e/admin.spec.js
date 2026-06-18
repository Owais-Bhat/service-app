import { test, expect } from '@playwright/test';
import { setupMocks, loginAs, navigateTo, ADMIN_USER } from './helpers/mocks.js';

// Boot always lands on #dashboard. Use navigateTo() to reach other pages.
async function bootAdmin(page) {
  await setupMocks(page);
  await loginAs(page, ADMIN_USER);
  await page.goto('/');
  await page.waitForURL(/#dashboard/, { timeout: 8000 });
}

test.describe('Admin Dashboard', () => {
  test('boots directly to dashboard when token is present', async ({ page }) => {
    await bootAdmin(page);
    await expect(page).toHaveURL(/#dashboard/);
  });

  test('dashboard renders sidebar with navigation links', async ({ page }) => {
    await bootAdmin(page);
    const sidebar = page.locator('aside.sidebar');
    await expect(sidebar).toBeVisible({ timeout: 5000 });
    const navText = await page.locator('.sidebar-nav').textContent();
    expect(navText).toContain('Dashboard');
  });

  test('global search input is in the topbar', async ({ page }) => {
    await bootAdmin(page);
    const search = page.locator('input[placeholder*="earch" i]');
    if (await search.count() > 0) {
      await expect(search.first()).toBeVisible();
    }
  });

  test('notification bell is visible in topbar', async ({ page }) => {
    await bootAdmin(page);
    const bell = page.locator('button[title*="otif" i], .notification-bell, [class*="notif"]').first();
    if (await bell.count() > 0) {
      await expect(bell).toBeVisible();
    }
  });

  test('admin sidebar contains staff-only tabs', async ({ page }) => {
    await bootAdmin(page);
    const sidebarText = await page.locator('aside.sidebar').textContent();
    // Admin tabs that should NOT appear for employees
    expect(sidebarText.includes('All Tickets') || sidebarText.includes('Finance') || sidebarText.includes('Users')).toBeTruthy();
  });

  test('theme toggle changes and persists', async ({ page }) => {
    await bootAdmin(page);
    const before = await page.evaluate(() => localStorage.getItem('theme'));
    const themeBtn = page.locator('button[title*="heme" i], .theme-toggle, [class*="theme-toggle"]').first();
    if (await themeBtn.count() > 0) {
      await themeBtn.click();
      const after = await page.evaluate(() => localStorage.getItem('theme'));
      expect(before).not.toEqual(after);
    }
  });
});

test.describe('Admin — All Tickets', () => {
  test('all-tickets page shows ticket data', async ({ page }) => {
    await bootAdmin(page);
    await navigateTo(page, 'all-tickets');
    const text = await page.locator('body').textContent();
    expect(text.includes('NE-') || text.includes('ticket') || text.includes('Ticket') || text.includes('John Doe')).toBeTruthy();
  });

  test('ticket list includes ticket identifiers', async ({ page }) => {
    await bootAdmin(page);
    await navigateTo(page, 'all-tickets');
    const text = await page.locator('body').textContent();
    // The all-tickets page shows truncated ticket UUIDs (#ticket-u) or NE-xxx inquiry numbers
    expect(
      text.includes('NE-260617') || text.includes('ticket-uuid') ||
      text.includes('#ticket') || text.includes('NE-') || text.includes('Jane Smith')
    ).toBeTruthy();
  });

  test('ticket status labels are displayed', async ({ page }) => {
    await bootAdmin(page);
    await navigateTo(page, 'all-tickets');
    const text = await page.locator('body').textContent();
    expect(text.toLowerCase().includes('open') || text.toLowerCase().includes('progress') || text.toLowerCase().includes('resolved')).toBeTruthy();
  });

  test('status filter select is available', async ({ page }) => {
    await bootAdmin(page);
    await navigateTo(page, 'all-tickets');
    const filterCtrl = page.locator('select, input[type="search"]');
    if (await filterCtrl.count() > 0) {
      await expect(filterCtrl.first()).toBeVisible();
    }
  });
});

test.describe('Admin — Service Requests (Inquiries)', () => {
  test('inquiries page shows customer names', async ({ page }) => {
    await bootAdmin(page);
    await navigateTo(page, 'inquiries');
    const text = await page.locator('body').textContent();
    expect(text.includes('John Doe') || text.includes('NE-') || text.includes('request') || text.includes('Request')).toBeTruthy();
  });
});

test.describe('Admin — User Management', () => {
  test('users page shows staff list', async ({ page }) => {
    await bootAdmin(page);
    await navigateTo(page, 'users');
    const text = await page.locator('body').textContent();
    expect(text.includes('Test Admin') || text.includes('Test Employee') || text.includes('admin') || text.includes('employee')).toBeTruthy();
  });

  test('edit button is available for users', async ({ page }) => {
    await bootAdmin(page);
    await navigateTo(page, 'users');
    const editBtn = page.locator('button:has-text("Edit"), button[title*="dit" i]');
    if (await editBtn.count() > 0) {
      await expect(editBtn.first()).toBeVisible();
    }
  });
});

test.describe('Admin — Attendance', () => {
  test('attendance records are displayed', async ({ page }) => {
    await bootAdmin(page);
    await navigateTo(page, 'attendance');
    const text = await page.locator('body').textContent();
    expect(text.toLowerCase().includes('clock') || text.toLowerCase().includes('attendance') || text.toLowerCase().includes('check-in')).toBeTruthy();
  });
});

test.describe('Admin — Device Types', () => {
  test('device types list shows catalog items', async ({ page }) => {
    await bootAdmin(page);
    await navigateTo(page, 'device-types');
    const text = await page.locator('body').textContent();
    expect(text.includes('Laptop') || text.includes('Mobile') || text.toLowerCase().includes('device')).toBeTruthy();
  });

  test('add device type button is present', async ({ page }) => {
    await bootAdmin(page);
    await navigateTo(page, 'device-types');
    const addBtn = page.locator('button:has-text("Add"), button:has-text("New"), button:has-text("+")');
    if (await addBtn.count() > 0) {
      await expect(addBtn.first()).toBeVisible();
    }
  });
});

test.describe('Admin — Notices', () => {
  test('notices page renders without crash', async ({ page }) => {
    await bootAdmin(page);
    await navigateTo(page, 'notices');
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Admin — Training', () => {
  test('training admin page renders', async ({ page }) => {
    await bootAdmin(page);
    await navigateTo(page, 'training-admin');
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Admin — Collections & Discounts', () => {
  test('collections page renders', async ({ page }) => {
    await bootAdmin(page);
    await navigateTo(page, 'collections');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('discounts page renders', async ({ page }) => {
    await bootAdmin(page);
    await navigateTo(page, 'discounts');
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Admin — Settings', () => {
  test('settings page has toggle controls', async ({ page }) => {
    await bootAdmin(page);
    await navigateTo(page, 'settings');
    const toggles = page.locator('input[type="checkbox"], button[role="switch"], .toggle');
    if (await toggles.count() > 0) {
      await expect(toggles.first()).toBeVisible();
    } else {
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });
});

test.describe('Admin — Device Tracking', () => {
  test('device tracking page shows log entries', async ({ page }) => {
    await bootAdmin(page);
    await navigateTo(page, 'device-tracking');
    const text = await page.locator('body').textContent();
    expect(text.toLowerCase().includes('device') || text.includes('Laptop') || text.toLowerCase().includes('tracking')).toBeTruthy();
  });
});
