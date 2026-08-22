import React, { useEffect } from 'react';
import { LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/theme/ThemeContext';
import { useAppFonts } from './src/theme/fonts';
import RootNavigator from './src/navigation/RootNavigator';

SplashScreen.preventAutoHideAsync();

// @react-three/fiber@9.7.0's internal store still constructs a THREE.Clock
// for its render loop; three@0.185 deprecated it in favor of THREE.Timer.
// Nothing in this app calls THREE.Clock directly, and fiber's own
// peerDependencies (three >=0.156, no upper bound) officially support this
// three version — this is upstream lag, not a bug here. Safe to silence
// until @react-three/fiber migrates internally.
LogBox.ignoreLogs(['THREE.Clock: This module has been deprecated']);

export default function App() {
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
