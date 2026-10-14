/* eslint-env jest */
// Native modules the admin screens touch indirectly. Each is replaced with the
// smallest stand-in that lets a screen render in a plain Node test runner.

jest.mock('react-native-worklets', () => ({}));
jest.mock('react-native-reanimated', () => require('./__mocks__/reanimated'));

jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = ({ children }) => React.createElement(View, null, children);
  return { Canvas: Stub, Circle: Stub, BlurMask: Stub, Group: Stub, Rect: Stub, LinearGradient: Stub };
});

jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { BlurView: ({ children, style }) => React.createElement(View, { style }, children) };
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => 'test-token'),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const asyncFns = (names) => Object.fromEntries(names.map((n) => [n, jest.fn(async () => ({ granted: false, status: 'denied' }))]));
jest.mock('expo-image-picker', () => ({
  ...asyncFns(['requestCameraPermissionsAsync', 'requestMediaLibraryPermissionsAsync', 'launchCameraAsync', 'launchImageLibraryAsync']),
  CameraType: { front: 'front', back: 'back' },
  MediaTypeOptions: { Images: 'Images', All: 'All' },
}));
jest.mock('expo-location', () => ({
  ...asyncFns([
    'requestForegroundPermissionsAsync', 'requestBackgroundPermissionsAsync', 'getCurrentPositionAsync',
    'startLocationUpdatesAsync', 'stopLocationUpdatesAsync', 'hasStartedLocationUpdatesAsync', 'reverseGeocodeAsync',
  ]),
  Accuracy: { Balanced: 3, High: 4, Low: 2 },
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn(), isTaskRegisteredAsync: jest.fn(async () => false) }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setBadgeCountAsync: jest.fn(async () => true),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: false })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: '' })),
  getDevicePushTokenAsync: jest.fn(async () => ({ data: '' })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
}));
jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true), getStringAsync: jest.fn(async () => '') }));
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = ({ children }) => React.createElement(View, null, children);
  return new Proxy({ __esModule: true, default: Stub }, { get: (t, k) => (k in t ? t[k] : Stub) });
});
