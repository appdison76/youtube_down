import { NativeModules } from 'react-native';

// 네이티브 모듈 디버깅
console.log('[MediaStoreModule] All NativeModules:', Object.keys(NativeModules));
console.log('[MediaStoreModule] MediaStoreModule available:', !!NativeModules.MediaStoreModule);
if (NativeModules.MediaStoreModule) {
  console.log('[MediaStoreModule] Methods:', Object.keys(NativeModules.MediaStoreModule));
}

export default NativeModules.MediaStoreModule;

