/* eslint-env jest */
// Sheets are drawn inside the app window (so the keyboard handling reaches
// them), and still behave like a Modal.
import React from 'react';
import { BackHandler, Text } from 'react-native';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider } from '../src/theme/ThemeContext';
import { AppModal, ModalHost } from '../src/components/AppModal';

const textOf = (tree: ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((t) => (Array.isArray(t.props.children) ? t.props.children.flat(3).join('') : String(t.props.children ?? '')))
    .join(' | ');

const Ctx = React.createContext('none');

async function mount(node: React.ReactElement) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ThemeProvider>{node}</ThemeProvider>);
  });
  return tree;
}

afterEach(() => jest.restoreAllMocks());

describe('AppModal', () => {
  test('shows its content while visible and removes it when closed', async () => {
    const Screen = ({ open }: { open: boolean }) => (
      <ModalHost>
        <Text>screen</Text>
        <AppModal visible={open} transparent animationType="slide">
          <Text>the sheet</Text>
        </AppModal>
      </ModalHost>
    );
    const tree = await mount(<Screen open />);
    expect(textOf(tree)).toContain('the sheet');
    await act(async () => tree.update(<ThemeProvider><Screen open={false} /></ThemeProvider>));
    expect(textOf(tree)).not.toContain('the sheet');
    expect(textOf(tree)).toContain('screen');
    act(() => tree.unmount());
  });

  test('follows the parent: new content replaces the old', async () => {
    const Screen = ({ label }: { label: string }) => (
      <ModalHost>
        <AppModal visible transparent>
          <Text>{label}</Text>
        </AppModal>
      </ModalHost>
    );
    const tree = await mount(<Screen label="one" />);
    expect(textOf(tree)).toContain('one');
    await act(async () => tree.update(<ThemeProvider><Screen label="two" /></ThemeProvider>));
    expect(textOf(tree)).toContain('two');
    expect(textOf(tree)).not.toContain('one');
    act(() => tree.unmount());
  });

  test('a sheet opened from another sheet sits on top of it', async () => {
    const tree = await mount(
      <ModalHost>
        <AppModal visible transparent>
          <Text>outer</Text>
          <AppModal visible transparent>
            <Text>inner</Text>
          </AppModal>
        </AppModal>
      </ModalHost>,
    );
    const text = textOf(tree);
    expect(text).toContain('outer');
    expect(text).toContain('inner');
    expect(text.indexOf('outer')).toBeLessThan(text.indexOf('inner'));
    act(() => tree.unmount());
  });

  test('the sheet reads the context of the host it was drawn in', async () => {
    const Reader = () => <Text>{`ctx:${React.useContext(Ctx)}`}</Text>;
    const tree = await mount(
      <Ctx.Provider value="attendance">
        <ModalHost>
          <AppModal visible transparent>
            <Reader />
          </AppModal>
        </ModalHost>
      </Ctx.Provider>,
    );
    expect(textOf(tree)).toContain('ctx:attendance');
    act(() => tree.unmount());
  });

  test('the back button closes it', async () => {
    let handler: (() => boolean) | null = null;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_: string, cb: () => boolean) => {
      handler = cb;
      return { remove: () => { handler = null; } };
    }) as never);
    const onClose = jest.fn();
    const tree = await mount(
      <ModalHost>
        <AppModal visible transparent onRequestClose={onClose}>
          <Text>x</Text>
        </AppModal>
      </ModalHost>,
    );
    expect(handler).not.toBeNull();
    expect(handler!()).toBe(true); // handled, so the app does not exit
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
    expect(handler).toBeNull();
  });

  test('without a host it falls back to the real Modal', async () => {
    const tree = await mount(
      <AppModal visible transparent>
        <Text>fallback</Text>
      </AppModal>,
    );
    expect(textOf(tree)).toContain('fallback');
    act(() => tree.unmount());
  });
});
