import { NativeModules } from 'react-native';

// Expo 모듈은 자동으로 등록되므로 직접 접근
const { MediaSessionModule } = NativeModules;

console.log('[expo-media-session-module] NativeModules:', Object.keys(NativeModules));
console.log('[expo-media-session-module] MediaSessionModule:', MediaSessionModule);

export default MediaSessionModule || {};

