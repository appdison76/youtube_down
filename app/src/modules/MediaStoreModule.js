import { NativeModules } from 'react-native';

// 레거시 RN 모듈 사용 (MediaStorePackage를 통해 등록됨)
const MediaStoreModule = NativeModules.MediaStoreModule;

// 디버깅
if (MediaStoreModule) {
  console.log('[MediaStoreModule] Loaded via NativeModules');
  console.log('[MediaStoreModule] Methods:', Object.keys(MediaStoreModule));
} else {
  console.warn('[MediaStoreModule] Not available!');
}

export default MediaStoreModule;

