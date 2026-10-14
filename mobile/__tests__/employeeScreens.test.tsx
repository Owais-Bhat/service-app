/* eslint-env jest */
import React from 'react';
import { Alert, Image, Text, TextInput } from 'react-native';
import renderer, { act, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeContext';
import { AuthProvider } from '../src/context/AuthContext';
import CalendarScreen from '../src/screens/CalendarScreen';
import RegisterRequestScreen from '../src/screens/RegisterRequestScreen';
import JobMaterialsScreen from '../src/screens/JobMaterialsScreen';
import EmployeePopupAd from '../src/components/EmployeePopupAd';

const today = new Date().toISOString().slice(0, 10);
const iso = new Date().toISOString();

interface Call {
  url: string;
  method: string;
  body: unknown;
}
const calls: Call[] = [];

const GET_FIXTURES: { match: RegExp; body: unknown }[] = [
  { match: /\/auth\/me/, body: { user: { id: 'emp-1', role: 'employee', full_name: 'Imran Khan', can_add_service: 1 } } },
  { match: /\/data\/installations/, body: [{ id: 'in1', full_name: 'Gulshan Mart', ticket_no: 'INST-1', installation_type: 'CCTV', preferred_date: `${today}T00:00:00.000Z`, preferred_time: '10:00 AM - 12:00 PM', status: 'assigned', address: 'Rajbagh, Srinagar', assigned_employee_id: 'emp-1' }] },
  { match: /\/data\/companies/, body: [{ id: 'co1', name: 'Hikvision' }] },
  { match: /\/data\/service_pricing/, body: [{ id: 's1', name: 'DVR repair', category: 'CCTV', sub_category: null, sub_sub_category: null, cost: '500' }] },
  { match: /\/jobs\/search/, body: [{ job_type: 'inquiry', job_id: 'job-1', ticket_no: 'NE-77', full_name: 'Dar Mart', phone: '9855555555', what: 'No video', status: 'in_progress', employee_name: 'Imran Khan', assigned_employee_id: 'emp-1' }] },
  { match: /\/stock\/locations\/[^/]+\/items/, body: [{ id: 'it1', held_qty: 4 }] },
  { match: /\/stock\/locations/, body: [{ id: 'loc-van', name: 'Van — Imran', kind: 'van', employee_id: 'emp-1', is_default: 0, owned: 1 }, { id: 'loc-store', name: 'Main store', kind: 'store', employee_id: null, is_default: 1, owned: 0 }] },
  { match: /\/inventory\/items/, body: [{ id: 'it1', sku: 'BNC', name: 'BNC connector', category: 'Accessories', unit: 'pcs', brand: 'Generic', model: null, selling_rate: 25, gst_rate: 18, quantity: 50, min_stock: 10, active: 1 }] },
  { match: /\/data\/ads/, body: [{ id: 'ad9', kind: 'image', url: '/uploads/popup.jpg', caption: null, device_target: 'both', placement: 'popup_employee', active: 1, starts_at: null, expires_at: null, position: 0 }] },
];

const original = global.fetch;
beforeAll(() => {
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method || 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined });
    if (method !== 'GET') {
      if (/\/jobs\/materials/.test(url)) return { ok: true, status: 200, json: async () => ({ issue: { id: 'mat-1', status: 'submitted' } }) };
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    const hit = GET_FIXTURES.find((f) => f.match.test(url));
    if (!hit) return { ok: false, status: 404, json: async () => ({ error: `no fixture for ${url}` }) };
    return { ok: true, status: 200, json: async () => hit.body };
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  (global as unknown as { fetch: unknown }).fetch = original;
});
beforeEach(() => {
  calls.length = 0;
});

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const noop = () => {};

const tick = async (n = 4) => {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
};

async function mount(node: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <AuthProvider>{node}</AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  await tick();
  return tree;
}

const textOf = (tree: ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((t) => (Array.isArray(t.props.children) ? t.props.children.flat(3).join('') : String(t.props.children ?? '')))
    .join(' | ');

// Presses whatever sits around the text node with this exact label.
async function press(tree: ReactTestRenderer, label: string) {
  const textNode = tree.root.findAll((n) => n.type === Text && n.props.children === label)[0];
  expect(textNode).toBeDefined();
  let node: ReactTestInstance | null = textNode;
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  expect(node).not.toBeNull();
  await act(async () => {
    node!.props.onPress();
  });
  await tick(2);
}

async function type(input: ReactTestInstance, value: string) {
  await act(async () => {
    input.props.onChangeText(value);
  });
}

describe('Calendar', () => {
  test('shows the month and the picked day’s jobs', async () => {
    const tree = await mount(<CalendarScreen onBack={noop} />);
    const text = textOf(tree);
    expect(text).toContain('Calendar');
    expect(text).toContain('Gulshan Mart');
    expect(text).toContain('Directions');
    act(() => tree.unmount());
  });
});

describe('Register customer', () => {
  test('refuses an incomplete form without writing anything', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await mount(<RegisterRequestScreen onBack={noop} />);
    await press(tree, 'Register & accept');
    expect(alert).toHaveBeenCalledWith('Customer name', expect.any(String));
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
    alert.mockRestore();
    act(() => tree.unmount());
  });

  test('registers a ticket, an accepted inquiry and an audit comment', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await mount(<RegisterRequestScreen onBack={noop} />);
    const inputs = tree.root.findAllByType(TextInput);
    await type(inputs[0], 'Zahid Mir');
    await type(inputs[1], '9811111111');
    await press(tree, 'CCTV');
    await type(inputs[inputs.length - 2], 'Rajbagh, Srinagar');
    await press(tree, 'Register & accept');

    const writes = calls.filter((c) => c.method === 'POST');
    expect(writes.map((w) => w.url.replace(/^.*\/api/, '').split('?')[0])).toEqual(['/data/tickets', '/data/inquiries', '/data/ticket_comments']);
    const inquiry = writes[1].body as Record<string, unknown>;
    expect(inquiry).toMatchObject({
      full_name: 'Zahid Mir',
      phone: '+919811111111',
      service_item: 'CCTV',
      location: 'Rajbagh, Srinagar',
      assigned_employee_id: 'emp-1',
      assignment_status: 'accepted',
      status: 'open',
    });
    expect((writes[0].body as Record<string, unknown>).assigned_to).toBe('emp-1');
    expect(alert).toHaveBeenCalledWith('Request registered', expect.stringContaining('NE-'), expect.any(Array));
    alert.mockRestore();
    act(() => tree.unmount());
  });
});

describe('Materials used', () => {
  test('finds a job, adds an item and sends it for approval', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.useFakeTimers({ advanceTimers: true });
    const tree = await mount(<JobMaterialsScreen onBack={noop} />);

    const inputs = () => tree.root.findAllByType(TextInput);
    await type(inputs()[0], 'NE-77');
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await tick();
    expect(textOf(tree)).toContain('Dar Mart');
    await press(tree, 'NE-77 · Dar Mart');

    await type(inputs()[0], 'bnc');
    await tick(2);
    await press(tree, 'BNC connector');
    expect(textOf(tree)).toContain('Qty');

    await press(tree, 'Send for approval');
    const post = calls.find((c) => c.method === 'POST' && /\/jobs\/materials/.test(c.url));
    expect(post).toBeDefined();
    expect(post!.body).toMatchObject({
      job_type: 'inquiry',
      job_id: 'job-1',
      location_id: 'loc-van',
      kind: 'used',
      lines: [expect.objectContaining({ item_id: 'it1', quantity: 1 })],
    });
    expect(alert).toHaveBeenCalledWith('Sent for approval', expect.any(String), expect.any(Array));

    jest.useRealTimers();
    alert.mockRestore();
    act(() => tree.unmount());
  });
});

describe('Employee popup ad', () => {
  test('shows the portal popup once', async () => {
    jest.spyOn(Image, 'getSize').mockImplementation(((_uri: string, ok?: (w: number, h: number) => void) => ok?.(400, 300)) as never);
    const tree = await mount(<EmployeePopupAd />);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Dismiss').length).toBeGreaterThan(0);
    act(() => tree.unmount());

    const again = await mount(<EmployeePopupAd />);
    expect(again.root.findAll((n) => n.props.accessibilityLabel === 'Dismiss')).toHaveLength(0);
    act(() => again.unmount());
  });
});
