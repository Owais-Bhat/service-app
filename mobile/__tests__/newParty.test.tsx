/* eslint-env jest */
// Adding a customer or supplier from inside an invoice, quotation, purchase or
// contract, without leaving the form.
import React from 'react';
import { Text, TextInput } from 'react-native';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider } from '../src/theme/ThemeContext';
import NewPartyButton, { CreatedParty } from '../src/components/admin/NewPartyButton';

const originalFetch = global.fetch;
let calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  calls = [];
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method || 'GET', body: init?.body ? JSON.parse(init.body) : null });
    if (/\/accounting\/business/.test(url)) return { ok: true, status: 200, json: async () => ({ business: { state_code: '01' } }) };
    if (/\/parties$/.test(url) && init?.method === 'POST') {
      return { ok: true, status: 201, json: async () => ({ id: 'p9', display_name: 'Zahid Mir', phone: '9811111111' }) };
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

// Finds the Text with this label and walks up to whatever handles its press.
function pressText(tree: ReactTestRenderer, label: string) {
  const t = tree.root.findAll((n) => (n.type as unknown) === Text && n.props.children === label)[0];
  let n = t.parent;
  while (n && !n.props.onPress) n = n.parent;
  return n!.props.onPress as () => void;
}

const inputBy = (tree: ReactTestRenderer, placeholder: string) =>
  tree.root.findAllByType(TextInput).find((i) => i.props.placeholder === placeholder)!;

async function mount(seed: string, onCreated: (p: CreatedParty) => void) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <ThemeProvider>
        <NewPartyButton kind="customer" seed={seed} onCreated={onCreated} />
      </ThemeProvider>,
    );
  });
  return tree;
}

describe('new customer from inside a document', () => {
  test('opens a short form prefilled from what was searched, and saves it', async () => {
    const created: CreatedParty[] = [];
    const tree = await mount('Zahid', (p) => created.push(p));
    expect(textOf(tree)).toContain('+ New customer');

    await act(async () => pressText(tree, '+ New customer')());
    expect(inputBy(tree, 'Person or company').props.value).toBe('Zahid');

    await act(async () => inputBy(tree, '10-digit mobile').props.onChangeText('9811111111'));
    await act(async () => inputBy(tree, 'Srinagar').props.onChangeText('Rajbagh'));
    await act(async () => {
      await pressText(tree, 'Save customer')();
    });

    const post = calls.find((c) => c.method === 'POST' && /\/parties$/.test(c.url))!;
    expect(post.body).toMatchObject({ display_name: 'Zahid', kind: 'customer', phone: '9811111111', place_of_supply_state_code: '01' });
    expect((post.body!.addresses as { city: string }[])[0].city).toBe('Rajbagh');
    expect(created).toEqual([{ id: 'p9', display_name: 'Zahid Mir', phone: '9811111111' }]);
    act(() => tree.unmount());
  });

  test('a phone number that was searched becomes the phone, not the name', async () => {
    const tree = await mount('98111 11111', () => {});
    await act(async () => pressText(tree, '+ New customer')());
    expect(inputBy(tree, 'Person or company').props.value).toBe('');
    expect(inputBy(tree, '10-digit mobile').props.value).toBe('9811111111');
    act(() => tree.unmount());
  });

  test('will not save without a name', async () => {
    const created: CreatedParty[] = [];
    const tree = await mount('', (p) => created.push(p));
    await act(async () => pressText(tree, '+ New customer')());
    await act(async () => {
      await pressText(tree, 'Save customer')();
    });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    expect(created).toHaveLength(0);
    act(() => tree.unmount());
  });
});
