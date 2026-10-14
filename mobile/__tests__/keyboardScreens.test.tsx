/* eslint-env jest */
// Screens that used to wrap their form in a KeyboardAvoidingView. They must
// still render, show their fields, and keep taps working while the keyboard is
// up (keyboardShouldPersistTaps) now that nothing shifts the layout.
import React from 'react';
import { ScrollView, Text, TextInput } from 'react-native';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeContext';
import { AuthProvider } from '../src/context/AuthContext';
import LoginScreen from '../src/screens/LoginScreen';
import LeaveFormScreen from '../src/screens/LeaveFormScreen';
import ClientSubmitTicketScreen from '../src/screens/ClientSubmitTicketScreen';
import JobPickerModal from '../src/components/JobPickerModal';
import ServicePickerModal from '../src/components/ServicePickerModal';

const originalFetch = global.fetch;

beforeAll(() => {
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string) => {
    if (/\/auth\/me/.test(url)) return { ok: false, status: 401, json: async () => ({ error: 'no session' }) };
    return { ok: true, status: 200, json: async () => [] };
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  (global as unknown as { fetch: unknown }).fetch = originalFetch;
});

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const noop = () => {};

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
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  return tree;
}

const textOf = (tree: ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((t) => (Array.isArray(t.props.children) ? t.props.children.flat(3).join('') : String(t.props.children ?? '')))
    .join(' | ');

describe('forms render without KeyboardAvoidingView', () => {
  test('Staff login', async () => {
    const tree = await mount(<LoginScreen onBack={noop} />);
    expect(textOf(tree)).toContain('Staff sign-in');
    expect(tree.root.findAllByType(TextInput).length).toBeGreaterThanOrEqual(2);
    act(() => tree.unmount());
  });

  test('Leave request form', async () => {
    const tree = await mount(<LeaveFormScreen onBack={noop} />);
    expect(tree.root.findAllByType(TextInput).length).toBeGreaterThanOrEqual(2);
    act(() => tree.unmount());
  });

  test('Client request form', async () => {
    const tree = await mount(<ClientSubmitTicketScreen onBack={noop} />);
    expect(tree.root.findAllByType(TextInput).length).toBeGreaterThanOrEqual(2);
    act(() => tree.unmount());
  });

  test('Job picker modal', async () => {
    const tree = await mount(<JobPickerModal onDismiss={noop} onSelect={noop} />);
    expect(tree.root.findAllByType(TextInput).length).toBeGreaterThanOrEqual(1);
    act(() => tree.unmount());
  });

  test('Service picker modal', async () => {
    const tree = await mount(<ServicePickerModal onDismiss={noop} onSelect={noop} />);
    expect(tree.root.findAllByType(TextInput).length).toBeGreaterThanOrEqual(1);
    act(() => tree.unmount());
  });

  test('scrollable forms keep taps working while the keyboard is open', async () => {
    for (const el of [<LoginScreen onBack={noop} />, <LeaveFormScreen onBack={noop} />, <ClientSubmitTicketScreen onBack={noop} />]) {
      const tree = await mount(el);
      const scrolls = tree.root.findAllByType(ScrollView);
      expect(scrolls.length).toBeGreaterThan(0);
      // Without KeyboardAvoidingView the first tap must reach a button instead
      // of just dismissing the keyboard.
      const form = scrolls.find((s) => s.props.keyboardShouldPersistTaps) ?? scrolls[0];
      expect(['handled', 'always']).toContain(form.props.keyboardShouldPersistTaps ?? 'never-set');
      act(() => tree.unmount());
    }
  });
});
