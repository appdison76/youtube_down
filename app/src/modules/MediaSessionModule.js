import { NativeModules } from 'react-native';

// 네이티브 모듈 디버깅
console.log('[MediaSessionModule] All NativeModules:', Object.keys(NativeModules));
console.log('[MediaSessionModule] MediaSessionModule available:', !!NativeModules.MediaSessionModule);
if (NativeModules.MediaSessionModule) {
  console.log('[MediaSessionModule] Methods:', Object.keys(NativeModules.MediaSessionModule));
}

export default NativeModules.MediaSessionModule;





