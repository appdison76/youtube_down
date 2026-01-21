import { requireNativeModule } from 'expo-modules-core';
import { NativeModules } from 'react-native';

let MediaStoreModule = null;
try {
  MediaStoreModule = requireNativeModule('MediaStoreModule');
  console.log('[MediaStoreModule] Loaded via requireNativeModule');
  if (MediaStoreModule) {
    console.log('[MediaStoreModule] Methods:', Object.keys(MediaStoreModule));
  }
} catch (error) {
  console.warn('[MediaStoreModule] Failed to load via requireNativeModule, trying NativeModules:', error);
  MediaStoreModule = NativeModules.MediaStoreModule;
  if (MediaStoreModule) {
    console.log('[MediaStoreModule] Loaded via NativeModules, Methods:', Object.keys(MediaStoreModule));
  } else {
    console.warn('[MediaStoreModule] Not available!');
  }
}

export default MediaStoreModule;

