/* eslint-env jest */
// The app draws edge-to-edge on Android, so the window does not shrink for the
// keyboard. These cover the pieces that make up for it.
import React from 'react';
import { Keyboard, ScrollView, Text, View } from 'react-native';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeContext';
import GlassTabBar from '../src/components/GlassTabBar';
import { KeyboardAwareScrollView, KeyboardInsetRoot } from '../src/components/KeyboardAware';

type Handler = (e?: unknown) => void;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.useFakeTimers();
  for (const k of Object.keys(handlers)) delete handlers[k];
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((evt: string, cb: Handler) => {
    handlers[evt] = cb;
    return { remove: () => { delete handlers[evt]; } };
  }) as never);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const showKeyboard = async (height: number) => {
  await act(async () => {
    (handlers.keyboardWillShow || handlers.keyboardDidShow)({ endCoordinates: { height } });
  });
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
};
const hideKeyboard = async () => {
  await act(async () => {
    (handlers.keyboardWillHide || handlers.keyboardDidHide)();
  });
};

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const wrap = (node: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <ThemeProvider>{node}</ThemeProvider>
  </SafeAreaProvider>
);

// The padding the wrapper puts under the screen.
const lift = (tree: ReactTestRenderer): number => {
  const inner = tree.root.findAllByType(View).find((v) => v.props.testID === 'inner-probe')!.parent!.parent!;
  const flat = Object.assign({}, ...[inner.props.style].flat(2).filter(Boolean));
  return Number(flat.paddingBottom || 0);
};

describe('KeyboardInsetRoot', () => {
  const mount = async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(wrap(<KeyboardInsetRoot><View testID="inner-probe" /></KeyboardInsetRoot>));
    });
    // The wrapper's first layout: 780 tall with the keyboard closed.
    const outer = tree.root.findAllByType(View).find((v) => typeof v.props.onLayout === 'function')!;
    await act(async () => outer.props.onLayout({ nativeEvent: { layout: { height: 780 } } }));
    return { tree, outer };
  };

  test('lifts the screen by the keyboard height when the window does not shrink', async () => {
    const { tree } = await mount();
    await showKeyboard(300);
    expect(lift(tree)).toBe(300);
    await hideKeyboard();
    expect(lift(tree)).toBe(0);
    act(() => tree.unmount());
  });

  test('adds nothing when the system already shrank the window', async () => {
    const { tree, outer } = await mount();
    await act(async () => {
      (handlers.keyboardWillShow || handlers.keyboardDidShow)({ endCoordinates: { height: 300 } });
    });
    await act(async () => outer.props.onLayout({ nativeEvent: { layout: { height: 480 } } }));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(lift(tree)).toBe(0);
    act(() => tree.unmount());
  });

  test('only lifts by what the system left uncovered', async () => {
    const { tree, outer } = await mount();
    await act(async () => {
      (handlers.keyboardWillShow || handlers.keyboardDidShow)({ endCoordinates: { height: 300 } });
    });
    await act(async () => outer.props.onLayout({ nativeEvent: { layout: { height: 680 } } })); // shrank 100 of 300
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(lift(tree)).toBe(200);
    act(() => tree.unmount());
  });
});

describe('floating tab bar', () => {
  const items = [
    { key: 'a', label: 'Home' },
    { key: 'b', label: 'Menu' },
  ];
  const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => String(t.props.children));

  test('steps aside while the keyboard is open and returns after', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(wrap(<GlassTabBar items={items} activeKey="a" onSelect={() => {}} />));
    });
    expect(texts(tree)).toEqual(expect.arrayContaining(['Home', 'Menu']));
    await showKeyboard(300);
    expect(texts(tree)).toEqual([]);
    await hideKeyboard();
    expect(texts(tree)).toEqual(expect.arrayContaining(['Home', 'Menu']));
    act(() => tree.unmount());
  });
});

describe('KeyboardAwareScrollView', () => {
  test('is a plain ScrollView to its callers: children, props and horizontal pass through', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        wrap(
          <>
            <KeyboardAwareScrollView testID="v" keyboardShouldPersistTaps="handled"><Text>vertical</Text></KeyboardAwareScrollView>
            <KeyboardAwareScrollView testID="h" horizontal><Text>sideways</Text></KeyboardAwareScrollView>
          </>,
        ),
      );
    });
    const all = tree.root.findAllByType(ScrollView);
    expect(all).toHaveLength(2);
    expect(all[0].props.keyboardShouldPersistTaps).toBe('handled');
    expect(all[1].props.horizontal).toBe(true);
    expect(all.map((s) => s.findAllByType(Text)[0].props.children)).toEqual(['vertical', 'sideways']);
    act(() => tree.unmount());
  });
});
