/* eslint-env jest */
// A plain-JS stand-in for react-native-reanimated: animations are instant and
// shared values are simple { value } boxes. Enough to render every screen and
// assert on its content; real motion is checked on a device.
const React = require('react');
const RN = require('react-native');

const chain = () => {
  const handler = {
    get: (_t, key) => (key === 'then' ? undefined : proxy),
    apply: () => proxy,
  };
  const proxy = new Proxy(function () {}, handler);
  return proxy;
};

const passThrough = (v) => v;
const Animated = {
  View: RN.View,
  Text: RN.Text,
  ScrollView: RN.ScrollView,
  Image: RN.Image,
  FlatList: RN.FlatList,
  createAnimatedComponent: (c) => c,
};

const api = {
  __esModule: true,
  default: Animated,
  ...Animated,
  useSharedValue: (v) => React.useRef({ value: v }).current,
  useAnimatedStyle: (fn) => {
    try {
      return fn();
    } catch {
      return {};
    }
  },
  useAnimatedProps: (fn) => {
    try {
      return fn();
    } catch {
      return {};
    }
  },
  useDerivedValue: (fn) => ({ value: fn() }),
  useAnimatedReaction: () => {},
  useAnimatedScrollHandler: () => () => {},
  useReducedMotion: () => false,
  withTiming: passThrough,
  withSpring: passThrough,
  withDelay: (_d, v) => v,
  withRepeat: passThrough,
  withSequence: (...v) => v[v.length - 1],
  cancelAnimation: () => {},
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  interpolate: (v, input, output) => output[0],
  interpolateColor: (v, input, output) => output[0],
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  Easing: new Proxy({}, { get: () => (() => 0) }),
  FadeIn: chain(),
  FadeOut: chain(),
  FadeInUp: chain(),
  FadeInDown: chain(),
  FadeInLeft: chain(),
  FadeInRight: chain(),
  ZoomIn: chain(),
  ZoomOut: chain(),
  SlideInRight: chain(),
  SlideOutRight: chain(),
  SlideInDown: chain(),
  SlideOutDown: chain(),
  Layout: chain(),
  LinearTransition: chain(),
};

module.exports = api;
