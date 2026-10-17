import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BackHandler, Modal, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

// A Modal that lives inside the app window instead of a window of its own.
//
// React Native's Modal opens a separate Android window. Keyboard events never
// reach it, and on edge-to-edge screens that window does not shrink for the
// keyboard either, so a sheet with a text field was left behind the keyboard.
// Drawn inside the app window, the sheet is lifted above the keyboard together
// with everything else (see KeyboardInsetRoot) and its fields can be scrolled
// into view.
//
// Use it exactly like Modal: visible, transparent, animationType, onRequestClose.
// Without a ModalHost above it (tests, a screen rendered on its own) it falls
// back to the real Modal, so nothing depends on the host being there.

interface HostApi {
  set: (id: number, node: React.ReactNode) => void;
  remove: (id: number) => void;
}

const HostContext = createContext<HostApi | null>(null);

let nextId = 1;

// Put one around the part of the app whose modals should draw over it. The
// modals render here, below the providers this host sits in, so a modal can use
// the same contexts as the screens next to it.
export function ModalHost({ children }: { children: React.ReactNode }) {
  const [layers, setLayers] = useState<{ id: number; node: React.ReactNode }[]>([]);
  const api = useRef<HostApi>({
    set: (id, node) =>
      setLayers((prev) => {
        const at = prev.findIndex((l) => l.id === id);
        if (at < 0) return [...prev, { id, node }];
        const next = prev.slice();
        next[at] = { id, node };
        return next;
      }),
    remove: (id) => setLayers((prev) => (prev.some((l) => l.id === id) ? prev.filter((l) => l.id !== id) : prev)),
  }).current;

  return (
    <HostContext.Provider value={api}>
      <View style={styles.flex}>
        {children}
        {layers.map((l) => (
          <View key={l.id} style={StyleSheet.absoluteFill}>
            {l.node}
          </View>
        ))}
      </View>
    </HostContext.Provider>
  );
}

function Layer({ children, animationType, transparent }: { children: React.ReactNode; animationType: 'none' | 'slide' | 'fade'; transparent: boolean }) {
  const { theme } = useTheme();
  const entering = animationType === 'slide' ? SlideInDown.duration(240) : animationType === 'fade' ? FadeIn.duration(160) : undefined;
  return (
    <Animated.View entering={entering} style={[StyleSheet.absoluteFill, !transparent && { backgroundColor: theme.bg }]}>
      {children}
    </Animated.View>
  );
}

interface Props {
  visible?: boolean;
  transparent?: boolean;
  animationType?: 'none' | 'slide' | 'fade';
  onRequestClose?: () => void;
  statusBarTranslucent?: boolean;
  children?: React.ReactNode;
}

export function AppModal({ visible = true, transparent = false, animationType = 'none', onRequestClose, statusBarTranslucent, children }: Props) {
  const host = useContext(HostContext);
  const id = useRef(nextId++).current;

  // Keep the host's copy of this modal current on every render.
  useLayoutEffect(() => {
    if (!host) return;
    if (visible) {
      host.set(
        id,
        <Layer animationType={animationType} transparent={transparent}>
          {children}
        </Layer>,
      );
    } else {
      host.remove(id);
    }
  });

  useEffect(() => () => host?.remove(id), [host, id]);

  // The hardware back button closes the topmost modal, like the real Modal.
  const close = useRef(onRequestClose);
  close.current = onRequestClose;
  useEffect(() => {
    if (!host || !visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close.current?.();
      return true;
    });
    return () => sub.remove();
  }, [host, visible]);

  if (!host) {
    return (
      <Modal visible={visible} transparent={transparent} animationType={animationType} onRequestClose={onRequestClose} statusBarTranslucent={statusBarTranslucent}>
        {children}
      </Modal>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
