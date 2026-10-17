/* eslint-env jest */
// An admin can be limited to chosen modules. The menu leaves out the rest, and
// the Users form sets the limit (the server enforces it on every call).
import React from 'react';
import { Text } from 'react-native';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider } from '../src/theme/ThemeContext';
import AdminMenuScreen from '../src/screens/admin/AdminMenuScreen';
import UserEditor from '../src/components/admin/UserEditor';
import { ADMIN_MENU } from '../src/navigation/adminMenu';
import { canOpenRoute, canUseModule, parseAdminModules, parseModuleList } from '../src/navigation/adminAccess';
import { UserRow } from '../src/api/adminPeople';

const originalFetch = global.fetch;
let calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];

beforeEach(() => {
  calls = [];
  jest.spyOn(console, 'log').mockImplementation(() => {});
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method || 'GET', body: init?.body ? JSON.parse(init.body) : null });
    if (/\/admin\/modules/.test(url)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          modules: [
            { id: 'sales', label: 'Invoices & Quotations', group: 'Sales' },
            { id: 'stock', label: 'Stock', group: 'Purchases & Stock' },
            { id: 'attendance', label: 'Attendance', group: 'Operations' },
          ],
          always_on: ['dashboard', 'notifications', 'profile'],
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
});

afterAll(() => {
  (global as unknown as { fetch: unknown }).fetch = originalFetch;
});

const textOf = (tree: ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((t) => (Array.isArray(t.props.children) ? t.props.children.flat(3).join('') : String(t.props.children ?? '')))
    .join(' | ');

function pressText(tree: ReactTestRenderer, label: string) {
  const t = tree.root.findAll((n) => (n.type as unknown) === Text && n.props.children === label)[0];
  let n = t.parent;
  while (n && !n.props.onPress) n = n.parent;
  return n!.props.onPress as () => void;
}

const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
};

describe('module list', () => {
  test('parses what the server stores', () => {
    expect(parseModuleList(null)).toBeNull();
    expect(parseModuleList('')).toBeNull();
    expect([...(parseModuleList('["sales","stock"]') as Set<string>)]).toEqual(['sales', 'stock']);
    expect((parseModuleList('[]') as Set<string>).size).toBe(0);
    // a damaged value locks down, it never opens up
    expect((parseModuleList('{nope') as Set<string>).size).toBe(0);
  });

  test('only an admin can be limited', () => {
    expect(parseAdminModules({ role: 'employee', admin_modules: '["sales"]' })).toBeNull();
    expect(parseAdminModules({ role: 'admin', admin_modules: null })).toBeNull();
    expect(parseAdminModules({ role: 'admin', admin_modules: '["sales"]' })?.has('sales')).toBe(true);
  });

  test('screens are allowed by the module that owns them', () => {
    const mods = parseModuleList(['sales']);
    expect(canOpenRoute(mods, 'Sales')).toBe(true);
    expect(canOpenRoute(mods, 'Purchases')).toBe(false);
    expect(canOpenRoute(mods, 'Users')).toBe(false);
    expect(canOpenRoute(mods, 'Profile')).toBe(true); // no module: open to every admin
    expect(canOpenRoute(null, 'Users')).toBe(true); // a full admin
    expect(canOpenRoute(parseModuleList(['popup-ads']), 'Ads')).toBe(true); // either ads module opens it
    expect(canUseModule(mods, 'stock', 'sales')).toBe(true);
    expect(canUseModule(mods, 'stock')).toBe(false);
  });

  test('every menu page with a real screen names a module', () => {
    const missing = ADMIN_MENU.flatMap((g) => g.items).filter((i) => i.route && i.route !== 'Profile' && !i.module).map((i) => i.route);
    expect(missing).toEqual([]);
  });
});

describe('admin menu for a limited admin', () => {
  const noop = () => {};
  const all = new Set(ADMIN_MENU.flatMap((g) => g.items).map((i) => i.route as string).filter(Boolean));

  test('shows only the pages of the modules given, and no empty groups', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider>
          <AdminMenuScreen available={all} modules={new Set(['sales', 'attendance'])} onOpen={noop} onTab={noop} />
        </ThemeProvider>,
      );
    });
    const text = textOf(tree);
    expect(text).toContain('Invoices & Quotations');
    expect(text).toContain('Attendance');
    expect(text).toContain('My Profile');
    expect(text).not.toContain('Purchases');
    expect(text).not.toContain('Users');
    expect(text).not.toContain('WhatsApp Campaigns');
    expect(text.toUpperCase()).not.toContain('MARKETING');
    act(() => tree.unmount());
  });

  test('a full admin still sees everything', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider>
          <AdminMenuScreen available={all} onOpen={noop} onTab={noop} />
        </ThemeProvider>,
      );
    });
    const text = textOf(tree);
    for (const needle of ['Purchases', 'Users', 'WhatsApp Campaigns', 'Daily Report']) expect(text).toContain(needle);
    act(() => tree.unmount());
  });
});

describe('Users form', () => {
  const adminRow = (over: Partial<UserRow> = {}): UserRow => ({
    id: 'u1', full_name: 'Sub Admin', email: 'sub@x.in', phone: null, role: 'admin', salary: 0, worker_type: 'fixed',
    can_add_service: 0, can_assign_tickets: 0, can_update_profile: 0, always_assign: 0, eod_exempt: 0,
    photo_clockin_exempt: 0, geofence_clockin_exempt: 0, installations_enabled: 1, allow_foc: 1, ...over,
  });

  const open = async (user: UserRow) => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider>
          <UserEditor visible user={user} onClose={() => {}} onSaved={() => {}} />
        </ThemeProvider>,
      );
    });
    await settle();
    return tree;
  };

  test('an admin gets the module section, loaded from the server, with the saved limit ticked', async () => {
    const tree = await open(adminRow({ admin_modules: '["sales"]' }));
    const text = textOf(tree);
    expect(text.toUpperCase()).toContain('WHAT THIS ADMIN CAN USE');
    expect(text).toContain('Invoices & Quotations');
    expect(text).toContain('Stock');
    expect(calls.some((c) => /\/admin\/modules/.test(c.url))).toBe(true);
    act(() => tree.unmount());
  });

  test('saving sends the chosen modules, and null when the admin is not limited', async () => {
    const tree = await open(adminRow({ admin_modules: '["sales"]' }));
    await act(async () => {
      await pressText(tree, 'Save changes')();
    });
    let patch = calls.find((c) => c.method === 'PATCH' && /\/admin\/users\/u1/.test(c.url))!;
    expect(patch.body!.admin_modules).toEqual(['sales']);
    expect(patch.body!.autoAssignEnabled).toBe(true);
    act(() => tree.unmount());

    calls = [];
    const full = await open(adminRow({ admin_modules: null }));
    await act(async () => {
      await pressText(full, 'Save changes')();
    });
    patch = calls.find((c) => c.method === 'PATCH' && /\/admin\/users\/u1/.test(c.url))!;
    expect(patch.body!.admin_modules).toBeNull();
    act(() => full.unmount());
  });

  test('staff do not send a module limit, and carry the auto-assignment switch', async () => {
    const tree = await open(adminRow({ role: 'employee', auto_assign_enabled: 0 }));
    const text = textOf(tree);
    expect(text).toContain('Include in auto-assignment (off = never auto-assigned)');
    expect(text.toUpperCase()).not.toContain('WHAT THIS ADMIN CAN USE');
    await act(async () => {
      await pressText(tree, 'Save changes')();
    });
    const patch = calls.find((c) => c.method === 'PATCH' && /\/admin\/users\/u1/.test(c.url))!;
    expect(patch.body).not.toHaveProperty('admin_modules');
    expect(patch.body!.autoAssignEnabled).toBe(false); // switched off for this person
    act(() => tree.unmount());
  });
});
