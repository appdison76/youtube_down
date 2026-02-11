// Shazam 모듈 래퍼 (2중 폴백: Shazam → ACRCloud)
import { Platform } from 'react-native';

let ShazamModule = null;

if (Platform.OS === 'android') {
  try {
    ShazamModule = require('expo-shazam-module').default;
  } catch (e1) {
    try {
      ShazamModule = require('../../../packages/expo-shazam-module').default;
    } catch (e2) {
      console.warn('[ShazamModule] Native module failed to load:', e1?.message || e1);
      ShazamModule = {
        isAvailable: () => false,
        initialize: async () => false,
        startRecognizing: async () => { throw new Error('Shazam not available'); },
        stopRecognizing: async () => {},
        isInitialized: () => false,
        isRecognizing: () => false,
        addListener: () => ({ remove: () => {} }),
      };
    }
  }
} else {
  ShazamModule = {
    isAvailable: () => false,
    initialize: async () => false,
    startRecognizing: async () => { throw new Error('Shazam not available'); },
    stopRecognizing: async () => {},
    isInitialized: () => false,
    isRecognizing: () => false,
    addListener: () => ({ remove: () => {} }),
  };
}

export default ShazamModule;
