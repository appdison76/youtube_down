import { Platform, DeviceEventEmitter } from 'react-native';
import MediaSessionModule from '../modules/MediaSessionModule';

/**
 * MediaSession 서비스
 * Android MediaSession API를 사용하여 잠금화면/알림 패널 플레이어 컨트롤 제공
 */
class MediaSessionService {
  constructor() {
    this.currentTrack = null;
    this.isPlaying = false;
    this.onPlayPause = null;
    this.onNext = null;
    this.onPrevious = null;
    this.onStop = null;
    this.onSeek = null;
    this.eventEmitter = null;
    this.isInitialized = false;
    this.initializationPromise = null;
    this.playListener = null;
    this.pauseListener = null;
    this.nextListener = null;
    this.previousListener = null;
    this.stopListener = null;
    this.seekListener = null;
  }

  /**
   * 재생 콜백 설정
   */
  setCallbacks({ onPlayPause, onPlay, onPause, onNext, onPrevious, onStop, onSeek }) {
    this.onPlayPause = onPlayPause;
    this.onPlay = onPlay;
    this.onPause = onPause;
    this.onNext = onNext;
    this.onPrevious = onPrevious;
    this.onStop = onStop;
    this.onSeek = onSeek;
  }

  /**
   * MediaSession 초기화
   */
  async initialize() {
    if (Platform.OS !== 'android') {
      console.log('[MediaSessionService] Not Android, skipping initialization');
      return;
    }

    // 이미 초기화 중이면 기다림
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // 이미 초기화되었으면 바로 반환
    if (this.isInitialized) {
      return;
    }

    this.initializationPromise = (async () => {
      try {
        if (!MediaSessionModule) {
          console.warn('[MediaSessionService] MediaSessionModule not available');
          return;
        }

        console.log('[MediaSessionService] Initializing MediaSession...');
        await MediaSessionModule.initialize();
        this.isInitialized = true;
        console.log('[MediaSessionService] MediaSession initialized successfully');

        // 이벤트 리스너 설정 - DeviceEventEmitter 직접 사용
        // 이벤트 리스너 등록
        this.playListener = DeviceEventEmitter.addListener('play', () => {
          console.log('[MediaSessionService] Event received: play');
          if (this.onPlay) {
            this.onPlay();
          } else if (this.onPlayPause) {
            // fallback to onPlayPause if onPlay is not set
            this.onPlayPause();
          } else {
            console.warn('[MediaSessionService] onPlay callback not set');
          }
        });
        
        this.pauseListener = DeviceEventEmitter.addListener('pause', () => {
          console.log('[MediaSessionService] Event received: pause');
          if (this.onPause) {
            this.onPause();
          } else if (this.onPlayPause) {
            // fallback to onPlayPause if onPause is not set
            this.onPlayPause();
          } else {
            console.warn('[MediaSessionService] onPause callback not set');
          }
        });
        
        this.nextListener = DeviceEventEmitter.addListener('next', () => {
          console.log('[MediaSessionService] Event received: next');
          if (this.onNext) {
            this.onNext();
          } else {
            console.warn('[MediaSessionService] onNext callback not set');
          }
        });
        
        this.previousListener = DeviceEventEmitter.addListener('previous', () => {
          console.log('[MediaSessionService] Event received: previous');
          if (this.onPrevious) {
            this.onPrevious();
          } else {
            console.warn('[MediaSessionService] onPrevious callback not set');
          }
        });
        
        this.stopListener = DeviceEventEmitter.addListener('stop', () => {
          console.log('[MediaSessionService] Event received: stop');
          if (this.onStop) {
            this.onStop();
          } else {
            console.warn('[MediaSessionService] onStop callback not set');
          }
        });
        
        this.seekListener = DeviceEventEmitter.addListener('seek', (data) => {
          console.log('[MediaSessionService] Event received: seek', data);
          if (this.onSeek && data?.position != null) {
            this.onSeek(data.position);
          } else {
            console.warn('[MediaSessionService] onSeek callback not set or position missing');
          }
        });
      } catch (error) {
        console.error('[MediaSessionService] Error initializing:', error);
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * 초기화 완료 대기
   */
  async ensureInitialized() {
    if (!this.isInitialized && !this.initializationPromise) {
      await this.initialize();
    } else if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  /**
   * 미디어 메타데이터 업데이트
   */
  async updateMetadata(track, duration = null) {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      // 초기화 확인
      await this.ensureInitialized();

      if (!MediaSessionModule) {
        console.warn('[MediaSessionService] MediaSessionModule not available for updateMetadata');
        return;
      }

      this.currentTrack = track;
      console.log('[MediaSessionService] Updating metadata:', {
        title: track?.title || '재생 중',
        author: track?.author || 'MelodySnap',
        thumbnail: track?.thumbnail || null,
        duration: duration,
      });
      await MediaSessionModule.updateMetadata(
        track?.title || '재생 중',
        track?.author || 'MelodySnap',
        track?.thumbnail || null,
        duration
      );
      console.log('[MediaSessionService] Metadata updated successfully');
      // 곡이 바뀔 때만 알림 표시
      console.log('[MediaSessionService] Showing notification...');
      await MediaSessionModule.showNotification();
      console.log('[MediaSessionService] Notification shown successfully');
    } catch (error) {
      console.error('[MediaSessionService] Error updating metadata:', error);
    }
  }

  /**
   * 재생 상태 업데이트
   */
  async updatePlaybackState(isPlaying, canGoNext = true, canGoPrevious = true, position = null, duration = null) {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      // 초기화 확인
      await this.ensureInitialized();

      if (!MediaSessionModule) {
        console.warn('[MediaSessionService] MediaSessionModule not available for updatePlaybackState');
        return;
      }

      this.isPlaying = isPlaying;
      // 트랙바 업데이트 로그 제거 (재생 시 너무 많은 로그 출력 방지)
      await MediaSessionModule.updatePlaybackState(isPlaying, canGoNext, canGoPrevious, position, duration);
      // 알림은 updateMetadata에서만 표시 (곡이 바뀔 때만)
    } catch (error) {
      console.error('[MediaSessionService] Error updating playback state:', error);
    }
  }

  /**
   * 알림 업데이트 (버튼 아이콘 등 즉시 반영)
   */
  async showNotification() {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      // 초기화 확인
      await this.ensureInitialized();

      if (!MediaSessionModule) {
        console.warn('[MediaSessionService] MediaSessionModule not available for showNotification');
        return;
      }

      await MediaSessionModule.showNotification();
    } catch (error) {
      console.error('[MediaSessionService] Error showing notification:', error);
    }
  }

  /**
   * 알림 제거 및 MediaSession 해제
   */
  async dismiss() {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      if (!MediaSessionModule) {
        return;
      }

      await MediaSessionModule.dismissNotification();
      this.currentTrack = null;
      this.isPlaying = false;
      this.isInitialized = false;
      this.initializationPromise = null;

      // 이벤트 리스너 제거
      if (this.playListener) {
        this.playListener.remove();
        this.playListener = null;
      }
      if (this.pauseListener) {
        this.pauseListener.remove();
        this.pauseListener = null;
      }
      if (this.nextListener) {
        this.nextListener.remove();
        this.nextListener = null;
      }
      if (this.previousListener) {
        this.previousListener.remove();
        this.previousListener = null;
      }
      if (this.stopListener) {
        this.stopListener.remove();
        this.stopListener = null;
      }
      if (this.seekListener) {
        this.seekListener.remove();
        this.seekListener = null;
      }
    } catch (error) {
      console.error('[MediaSessionService] Error dismissing:', error);
    }
  }
}

// 싱글톤 인스턴스
const mediaSessionService = new MediaSessionService();

export default mediaSessionService;

