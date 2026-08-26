import { registerRootComponent } from 'expo';

// Must be imported before anything else — TaskManager.defineTask() has to
// run on every process start (including a headless relaunch the OS triggers
// just to deliver a background location update), not only when a screen
// happens to import it.
import './src/location/backgroundLocationTask';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
