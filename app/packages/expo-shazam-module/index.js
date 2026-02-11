// Expo module for ShazamKit Android
// 2-way fallback: Shazam (1st) → ACRCloud (2nd)
import { requireNativeModule } from 'expo-modules-core';

function getShazamModule() {
  try {
    return requireNativeModule('ShazamModule');
  } catch (e) {
    // 네이티브 모듈 미등록 시(앱 미리빌드 등) 스텁 반환
    console.warn('[expo-shazam-module] Native module not loaded, using stub:', e?.message || e);
    return {
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

export default getShazamModule();
