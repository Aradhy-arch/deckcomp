// Polyfill ExpoTopicSubscriptionModule for Expo Go and environments missing native FCM topics
try {
  const g = globalThis as any;
  if (!g.expo) {
    let _expo: any = undefined;
    Object.defineProperty(g, 'expo', {
      configurable: true,
      enumerable: true,
      get() {
        return _expo;
      },
      set(val) {
        _expo = val;
        try {
          if (_expo && _expo.modules && !_expo.modules.ExpoTopicSubscriptionModule) {
            _expo.modules.ExpoTopicSubscriptionModule = {
              subscribeToTopicAsync: async () => {},
              unsubscribeFromTopicAsync: async () => {},
              addListener: () => {},
              removeListeners: () => {},
            };
          }
        } catch {}
      },
    });
  } else if (g.expo.modules && !g.expo.modules.ExpoTopicSubscriptionModule) {
    g.expo.modules.ExpoTopicSubscriptionModule = {
      subscribeToTopicAsync: async () => {},
      unsubscribeFromTopicAsync: async () => {},
      addListener: () => {},
      removeListeners: () => {},
    };
  }
} catch {}

import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
