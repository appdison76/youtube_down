// ACRCloud 모듈 래퍼
import { Platform } from 'react-native';

let ACRCloudModule = null;

if (Platform.OS === 'android') {
  try {
    ACRCloudModule = require('expo-acrcloud-module').default;
  } catch (error) {
    console.warn('[ACRCloudModule] Module not available:', error);
    // 모듈이 없을 때를 위한 더미 구현
    ACRCloudModule = {
      initialize: async () => {
        console.warn('[ACRCloudModule] Module not initialized. Please install ACRCloud SDK.');
        return false;
      },
      startRecognizing: async () => {
        console.warn('[ACRCloudModule] Module not initialized.');
        return false;
      },
      stopRecognizing: async () => {
        console.warn('[ACRCloudModule] Module not initialized.');
        return false;
      },
      isRecognizing: () => false,
      isInitialized: () => false,
    };
  }
} else {
  // iOS는 아직 지원하지 않음
  ACRCloudModule = {
    initialize: async () => {
      console.warn('[ACRCloudModule] iOS is not supported yet.');
      return false;
    },
    startRecognizing: async () => {
      console.warn('[ACRCloudModule] iOS is not supported yet.');
      return false;
    },
    stopRecognizing: async () => {
      console.warn('[ACRCloudModule] iOS is not supported yet.');
      return false;
    },
    isRecognizing: () => false,
    isInitialized: () => false,
  };
}

export default ACRCloudModule;
