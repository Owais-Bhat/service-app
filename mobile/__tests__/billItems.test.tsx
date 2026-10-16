/* eslint-env jest */
// The "Items Used" block of a bill: stock items with an editable quantity and
// price, plus a line the technician types in that is not in the stock list.
import React from 'react';
import { Text, TextInput } from 'react-native';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider } from '../src/theme/ThemeContext';
import BillItemsEditor from '../src/components/BillItemsEditor';
import { BillItemLine, InventoryItem } from '../src/api/inventory';

const STOCK: InventoryItem[] = [
  { id: 'it1', sku: 'CAM-2', name: 'Dome Camera 2MP', category: 'Camera', unit: 'pcs', selling_rate: 1800, gst_rate: 18, quantity: 1, min_stock: 2 },
];

function Harness({ start, onSeen }: { start: BillItemLine[]; onSeen: (v: BillItemLine[]) => void }) {
  const [items, setItems] = React.useState(start);
  return (
    <ThemeProvider>
      <BillItemsEditor
        items={items}
        catalogue={STOCK}
        onChange={(v) => {
          setItems(v);
          onSeen(v);
        }}
      />
    </ThemeProvider>
  );
}

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

async function mount(start: BillItemLine[], seen: BillItemLine[][]) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Harness start={start} onSeen={(v) => seen.push(v)} />);
  });
  return tree;
}

describe('bill items editor', () => {
  test('shows stock lines and the lines the technician added himself', async () => {
    const tree = await mount(
      [
        { item_id: 'it1', name: 'Dome Camera 2MP', quantity: 2, rate: 1800 },
        { item_id: null, name: 'Extra cable', quantity: 3, rate: 40 },
      ],
      [],
    );
    const text = textOf(tree);
    expect(text).toContain('Dome Camera 2MP');
    expect(text).toContain('Extra cable  (your own line)');
    expect(text).toContain('₹3,600');
    expect(text).toContain('₹120');
    expect(text).toContain('Items total ₹3,720');
    act(() => tree.unmount());
  });

  test('a price can be changed on the line', async () => {
    const seen: BillItemLine[][] = [];
    const tree = await mount([{ item_id: 'it1', name: 'Dome Camera 2MP', quantity: 1, rate: 1800 }], seen);
    const price = tree.root.findAllByType(TextInput).find((i) => i.props.accessibilityLabel === 'Price')!;
    await act(async () => price.props.onChangeText('1500'));
    expect(seen[seen.length - 1][0].rate).toBe(1500);
    expect(seen[seen.length - 1][0].item_id).toBe('it1');
    act(() => tree.unmount());
  });

  test('an item that is not in stock can be typed in with its own price', async () => {
    const seen: BillItemLine[][] = [];
    const tree = await mount([], seen);
    const boxes = tree.root.findAllByType(TextInput);
    const byHint = (h: string) => boxes.find((b) => b.props.placeholder === h)!;
    await act(async () => byHint('What is it? (e.g. extra cable)').props.onChangeText('RJ45 connector'));
    await act(async () => byHint('Qty').props.onChangeText('10'));
    await act(async () => byHint('Price ₹').props.onChangeText('15'));
    await act(async () => pressText(tree, 'Add')());
    expect(seen[seen.length - 1]).toEqual([{ item_id: null, name: 'RJ45 connector', quantity: 10, rate: 15 }]);
    expect(textOf(tree)).toContain('RJ45 connector  (your own line)');
    act(() => tree.unmount());
  });

  test('refuses an own line without a price', async () => {
    const seen: BillItemLine[][] = [];
    const tree = await mount([], seen);
    const boxes = tree.root.findAllByType(TextInput);
    await act(async () => boxes.find((b) => b.props.placeholder === 'What is it? (e.g. extra cable)')!.props.onChangeText('Tape'));
    await act(async () => pressText(tree, 'Add')());
    expect(seen).toHaveLength(0);
    expect(textOf(tree)).toContain('Enter the price');
    act(() => tree.unmount());
  });
});
