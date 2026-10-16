import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Keyboard, KeyboardEvent, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, ScrollViewProps, StyleSheet, TextInput, View } from 'react-native';

// Keyboard handling without the built-in avoiding view.
//
// This app draws edge-to-edge on Android, and in that mode the window no longer
// shrinks when the keyboard opens (adjustResize has nothing to resize), so the
// keyboard simply sits on top of whatever is at the bottom: inputs, buttons and
// the floating tab bar. Three small pieces put that right:
//   • useKeyboardHeight  – how tall the keyboard is right now (0 when closed);
//   • KeyboardInsetRoot  – one wrapper at the top of the app that lifts the whole
//                          screen above the keyboard, but only if the system did
//                          not already shrink the window itself;
//   • KeyboardAwareScrollView – a ScrollView that scrolls the focused input into
//                          view, and keeps it there when focus moves to the next.
// Native Modals (sheets, pickers) are their own windows and resize by
// themselves, so they need none of this.

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e: KeyboardEvent) =>
      setHeight(Math.max(0, Math.round(e.endCoordinates?.height ?? 0))),
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

// How long to wait after the keyboard appears before judging whether the system
// already resized the window (its layout pass lands a moment after the event).
const SETTLE_MS = 120;

export function KeyboardInsetRoot({ children }: { children: React.ReactNode }) {
  const kb = useKeyboardHeight();
  const kbRef = useRef(0);
  kbRef.current = kb;
  const base = useRef(0); // height of this wrapper while the keyboard is closed
  const now = useRef(0);
  const [layoutTick, setLayoutTick] = useState(0);
  const [lift, setLift] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    now.current = h;
    if (kbRef.current === 0) base.current = h;
    setLayoutTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (kb === 0) {
      setLift(0);
      return;
    }
    const t = setTimeout(() => {
      // If the window shrank by itself the content is already above the keyboard.
      const shrunk = base.current > 0 ? Math.max(0, base.current - now.current) : 0;
      setLift(Math.max(0, kb - shrunk));
    }, SETTLE_MS);
    return () => clearTimeout(t);
  }, [kb, layoutTick]);

  return (
    <View style={styles.flex} onLayout={onLayout}>
      <View style={[styles.flex, lift > 0 ? { paddingBottom: lift } : null]}>{children}</View>
    </View>
  );
}

// A ScrollView that brings the focused text input into view. Drop-in: it takes
// every ScrollView prop and ref. Horizontal lists are passed straight through.
export const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(function KeyboardAwareScrollView(props, ref) {
  const { horizontal, onScroll, scrollEventThrottle, ...rest } = props;
  const inner = useRef<ScrollView>(null);
  useImperativeHandle(ref, () => inner.current as ScrollView);
  const kb = useKeyboardHeight();
  const offset = useRef(0);
  const lastFocused = useRef<unknown>(null);

  const ensureVisible = useCallback(() => {
    const sv = inner.current;
    const input = TextInput.State.currentlyFocusedInput?.();
    if (!sv || !input) return;
    (sv as unknown as View).measureInWindow((sx, sy, sw, sh) => {
      input.measureInWindow((ix, iy, iw, ih) => {
        if (!ih || ix + iw < sx || ix > sx + sw) return; // not inside this scroll area
        const margin = 28;
        const bottom = sy + sh;
        // An input that starts above the scroll area belongs to a pinned toolbar.
        if (iy < sy) return;
        const overflow = iy + ih + margin - bottom;
        if (overflow > 0) sv.scrollTo({ y: Math.max(0, offset.current + overflow), animated: true });
      });
    });
  }, []);

  useEffect(() => {
    if (horizontal || kb === 0) return;
    const first = setTimeout(ensureVisible, SETTLE_MS + 100);
    // Moving from one field to the next gives no keyboard event, so look for it.
    const watch = setInterval(() => {
      const cur = TextInput.State.currentlyFocusedInput?.();
      if (cur !== lastFocused.current) {
        lastFocused.current = cur;
        ensureVisible();
      }
    }, 250);
    return () => {
      clearTimeout(first);
      clearInterval(watch);
      lastFocused.current = null;
    };
  }, [kb, horizontal, ensureVisible]);

  if (horizontal) return <ScrollView ref={inner} horizontal onScroll={onScroll} scrollEventThrottle={scrollEventThrottle} {...rest} />;

  return (
    <ScrollView
      ref={inner}
      {...rest}
      scrollEventThrottle={scrollEventThrottle ?? 16}
      onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
        offset.current = e.nativeEvent.contentOffset.y;
        onScroll?.(e);
      }}
    />
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
