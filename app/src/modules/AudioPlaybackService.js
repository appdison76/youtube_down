import { NativeModules, Platform } from 'react-native';

const AudioPlaybackService = Platform.OS === 'android' ? NativeModules.AudioPlaybackService : null;

/**
 * 백그라운드 음악 재생 유지를 위한 Foreground Service (Android 전용).
 * 재생 시작 시 호출하고, 재생 중지 시 stop 호출.
 */
export default {
  start(title, artist) {
    if (AudioPlaybackService && typeof AudioPlaybackService.startService === 'function') {
      AudioPlaybackService.startService(title || '', artist || '');
    }
  },

  updateNotification(title, artist) {
    if (AudioPlaybackService && typeof AudioPlaybackService.updateNotification === 'function') {
      AudioPlaybackService.updateNotification(title || '', artist || '');
    }
  },

  stop() {
    if (AudioPlaybackService && typeof AudioPlaybackService.stopService === 'function') {
      AudioPlaybackService.stopService();
    }
  },
};
