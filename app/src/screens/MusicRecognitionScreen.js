import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar,
  Animated,
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Linking,
  ScrollView,
  Image,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import AdBanner from '../components/AdBanner';
import HeaderTitle from '../components/HeaderTitle';
import LanguageSelector from '../components/LanguageSelector';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../locales/translations';
import { searchVideos } from '../services/downloadService';
import { addFavorite, removeFavorite, isFavorite, getFavorites } from '../services/database';
import { fetchWithFallback } from '../config/api';
import ACRCloudModule from '../modules/ACRCloudModule';
import ShazamModule from '../modules/ShazamModule';
import { 
  sendRecognitionNotification, 
  sendRecognitionFailedNotification,
  setupNotificationListeners,
  requestNotificationPermission 
} from '../services/notifications';

export default function MusicRecognitionScreen({ navigation }) {
  const { currentLanguage } = useLanguage();
  const t = translations[currentLanguage];
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState(null);
  const [youtubeResults, setYoutubeResults] = useState([]);
  const [recognitionError, setRecognitionError] = useState(null); // 인식 실패 메시지
  
  // recognitionResult 상태 변경 추적
  useEffect(() => {
    console.log('[MusicRecognitionScreen] 🔄 recognitionResult changed:', recognitionResult);
    console.log('[MusicRecognitionScreen] 🔄 recognitionResult type:', typeof recognitionResult);
    console.log('[MusicRecognitionScreen] 🔄 recognitionResult is truthy:', !!recognitionResult);
    if (recognitionResult) {
      console.log('[MusicRecognitionScreen] ✅ Recognition result is set - UI should update');
      console.log('[MusicRecognitionScreen] 📝 Title:', recognitionResult.title);
      console.log('[MusicRecognitionScreen] 📝 Artist:', recognitionResult.artist);
      console.log('[MusicRecognitionScreen] 📝 Album:', recognitionResult.album);
      console.log('[MusicRecognitionScreen] 🎨 UI should render result area now');
    } else {
      console.log('[MusicRecognitionScreen] ⚠️ recognitionResult is null/undefined - UI will not show result');
    }
  }, [recognitionResult]);
  const [loadingYoutube, setLoadingYoutube] = useState(false);
  const [recording, setRecording] = useState(null);
  const [favorites, setFavorites] = useState(new Set()); // 즐겨찾기 ID Set
  // 내부 소리 모드 제거 - 주변 소리 모드만 사용
  const useInternalAudio = false;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const circleAnims = useRef([0, 1, 2, 3, 4].map(() => ({ scale: new Animated.Value(0.6), opacity: new Animated.Value(0.4) }))).current;
  const recordingTimeoutRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const shouldContinueRecognitionRef = useRef(true); // 인식 계속 여부 플래그

  // ACRCloud 초기화 및 이벤트 리스너 설정
  useEffect(() => {
    const initializeACRCloud = async () => {
      try {
        // ✅ ACRCloudModule이 존재하는지 먼저 확인
        if (!ACRCloudModule) {
          console.warn('[MusicRecognitionScreen] ⚠️ ACRCloudModule not available, skipping initialization');
          return;
        }

        if (Platform.OS !== 'android') {
          console.log('[MusicRecognitionScreen] Skipping ACRCloud initialization (not Android)');
          return;
        }

        console.log('[MusicRecognitionScreen] Initializing ACRCloud...');
        console.log('[MusicRecognitionScreen] Platform.OS:', Platform.OS);
        console.log('[MusicRecognitionScreen] ACRCloudModule:', ACRCloudModule);
        console.log('[MusicRecognitionScreen] useInternalAudio:', useInternalAudio);
        
        // ACRCloud 프로젝트 정보
        const accessKey = 'b01665eac8c9b3032f229e8cb9a3e702';
        const accessSecret = 'T4GxjwxQZ9nngfwLmyu3hy20Fp2jJGVqLI4nCvD7';
        const host = 'identify-ap-southeast-1.acrcloud.com';
        
        // 주변 소리 모드만 사용 (마이크 모드) - 안전하게 처리
        try {
          if (ACRCloudModule.setInternalAudioMode) {
            await ACRCloudModule.setInternalAudioMode(false);
            console.log('[MusicRecognitionScreen] Audio mode: Microphone (external sound)');
          }
        } catch (audioModeError) {
          console.warn('[MusicRecognitionScreen] ⚠️ Failed to set audio mode:', audioModeError.message);
          // 오디오 모드 설정 실패해도 계속 진행
        }
        
        // ACRCloud가 초기화되지 않았을 때만 초기화 - 안전하게 처리
        try {
          const isInitialized = await ACRCloudModule.isInitialized();
          console.log('[MusicRecognitionScreen] Is initialized:', isInitialized);
          
          if (!isInitialized) {
            console.log('[MusicRecognitionScreen] Calling initialize...');
            const initResult = await ACRCloudModule.initialize(accessKey, accessSecret, host);
            console.log('[MusicRecognitionScreen] Initialize result:', initResult);
            
            if (initResult) {
              console.log('[MusicRecognitionScreen] ✅ ACRCloud initialized successfully');
            } else {
              console.warn('[MusicRecognitionScreen] ⚠️ ACRCloud initialization returned false');
            }
          } else {
            console.log('[MusicRecognitionScreen] ACRCloud already initialized');
          }
        } catch (initError) {
          console.warn('[MusicRecognitionScreen] ⚠️ ACRCloud initialization error (non-fatal):', initError.message);
          // 초기화 실패해도 앱은 계속 실행
        }

        // Shazam 1순위 사용 시: 서버에서 토큰 받아 초기화
        if (ShazamModule?.isAvailable?.()) {
          try {
            const res = await fetchWithFallback('/api/shazam-token');
            if (res.ok) {
              const data = await res.json();
              if (data?.token && ShazamModule.initialize) {
                const ok = await ShazamModule.initialize(data.token);
                console.log('[MusicRecognitionScreen] Shazam initialize:', ok ? '✅' : '⚠️');
              }
            }
          } catch (shazamErr) {
            console.warn('[MusicRecognitionScreen] Shazam token fetch/init failed (ACRCloud fallback):', shazamErr?.message);
          }
        }
      } catch (error) {
        // ✅ 첫 설치 시 권한이 없어서 실패할 수 있으므로 에러를 조용히 처리
        // 개발 빌드에서도 LogBox에 표시되지 않도록 console.warn 사용
        // 사용자가 버튼을 눌렀을 때 권한 요청 후 다시 초기화 시도
        console.warn('[MusicRecognitionScreen] ⚠️ ACRCloud initialization skipped (will retry when user starts recognition):', error.message);
      }
    };

    // ✅ 개발 빌드에서 크래시 방지를 위해 약간의 지연 후 초기화
    const initTimeout = setTimeout(() => {
      initializeACRCloud().catch(error => {
        console.warn('[MusicRecognitionScreen] ⚠️ ACRCloud initialization failed (non-fatal):', error.message);
      });
    }, 500); // 500ms 지연으로 앱이 완전히 마운트된 후 초기화

    // ACRCloud 이벤트 리스너 설정
    // Expo Modules에서는 모듈에서 직접 addListener를 사용해야 합니다
    let recognitionResultListener = null;
    let recognitionErrorListener = null;
    let volumeChangedListener = null;

    try {
      if (Platform.OS === 'android' && ACRCloudModule && typeof ACRCloudModule.addListener === 'function') {
        console.log('[MusicRecognitionScreen] Setting up event listeners...');
        console.log('[MusicRecognitionScreen] ACRCloudModule:', ACRCloudModule);
        console.log('[MusicRecognitionScreen] 📝 Registering event listeners using Expo Modules...');
      
      // Expo Modules에서는 모듈에서 직접 addListener를 사용
      // 1. 인식 결과 리스너 (이벤트 이름: onRecognitionResult)
      recognitionResultListener = ACRCloudModule.addListener('onRecognitionResult', (result) => {
          console.log('[MusicRecognitionScreen] ✅✅✅ Recognition result received:', result);
          console.log('[MusicRecognitionScreen] ✅ Event name matches: onRecognitionResult');
          console.log('[MusicRecognitionScreen] 📝 Result data:', JSON.stringify(result));
          console.log('[MusicRecognitionScreen] 📝 Result title:', result?.title);
          console.log('[MusicRecognitionScreen] 📝 Result artist:', result?.artist);
          console.log('[MusicRecognitionScreen] 📊 Result score (confidence):', result?.score);
          console.log('[MusicRecognitionScreen] 📊 Result playOffset:', result?.playOffset);
          
          // 타임아웃 제거
          if (recordingTimeoutRef.current) {
            clearTimeout(recordingTimeoutRef.current);
            recordingTimeoutRef.current = null;
          }
          
          // 백그라운드 모드에서는 인식 계속 (새 곡을 찾을 때까지)
          // 인식 중지하지 않음
          
          // 상태 업데이트 (강제로 UI 갱신)
          const newResult = {
            title: result.title || '',
            artist: result.artist || '',
            album: result.album || '',
            score: result.score, // 신뢰도 점수 저장
            playOffset: result.playOffset, // 재생 오프셋 저장
          };
          
          // 🔥 신뢰도 점수 로그만 남기기 (알림 팝업 제거)
          if (result?.score !== undefined && result.score >= 0) {
            if (result.score < 50) {
              console.warn('[MusicRecognitionScreen] ⚠️ Low confidence score detected:', result.score);
              console.warn('[MusicRecognitionScreen] ⚠️ Result may be inaccurate. Please try again.');
            } else if (result.score < 70) {
              console.log('[MusicRecognitionScreen] ⚠️ Moderate confidence score:', result.score);
              console.log('[MusicRecognitionScreen] 💡 If result seems wrong, try recognizing at a different part of the song');
            } else {
              console.log('[MusicRecognitionScreen] ✅ Good confidence score:', result.score);
            }
          }
          
          console.log('[MusicRecognitionScreen] 📝 Setting recognition result:', newResult);
          console.log('[MusicRecognitionScreen] 📝 Result title:', newResult.title);
          console.log('[MusicRecognitionScreen] 📝 Result artist:', newResult.artist);
          
          // 상태 업데이트 (React가 리렌더링하도록)
          setIsRecognizing(false);
          setRecognitionResult(newResult);
          setRecognitionError(null); // 인식 성공 시 에러 메시지 초기화
          
          console.log('[MusicRecognitionScreen] ✅ State updated - UI should refresh now');
          
          // 인식 중지 (알림 발송 전에 중지)
          if (ACRCloudModule && ACRCloudModule.stopRecognizing) {
            ACRCloudModule.stopRecognizing().catch(err => {
              console.error('[MusicRecognitionScreen] Error stopping recognition:', err);
            });
          }
          
          // Foreground Service 중지 (알림이 사라지도록)
          if (Platform.OS === 'android') {
            try {
              const { MusicRecognitionService } = NativeModules;
              if (MusicRecognitionService) {
                MusicRecognitionService.stopService();
                console.log('[MusicRecognitionScreen] ✅ Foreground Service stopped (recognition completed)');
              }
            } catch (error) {
              console.warn('[MusicRecognitionScreen] ⚠️ Failed to stop Foreground Service:', error);
            }
          }
          
          // 항상 백그라운드 모드로 동작: 알림 발송
          const isBackground = appStateRef.current !== 'active';
          console.log('[MusicRecognitionScreen] 📱 Background mode: Sending notification');
          sendRecognitionNotification(newResult.title, newResult.artist, {
            title: newResult.title,
            artist: newResult.artist,
            album: newResult.album,
          });
          
          // 인식 완료 후 자동 재시작하지 않음
          // 알림 발송 시점에 인식을 중지하므로, 사용자가 앱에 들어오지 않아도 인식은 중지됨
          // 다음 곡을 찾으려면 사용자가 다시 인식 버튼을 눌러야 함
          console.log('[MusicRecognitionScreen] ✅ Recognition completed and stopped. Waiting for user action.');
          
          // YouTube에서 검색 (샤잠처럼 자동으로 검색 결과 표시)
          if (result.title && result.artist) {
            console.log('[MusicRecognitionScreen] 🔍 Searching YouTube:', result.title, result.artist);
            searchOnYouTube(result.title, result.artist);
          } else if (result.title) {
            console.log('[MusicRecognitionScreen] 🔍 Searching YouTube (title only):', result.title);
            searchOnYouTube(result.title, '');
          } else {
            console.warn('[MusicRecognitionScreen] ⚠️ No title or artist, skipping YouTube search');
          }
        });
        console.log('[MusicRecognitionScreen] ✅ Listener registered: onRecognitionResult');
        console.log('[MusicRecognitionScreen] ✅ Listener object:', recognitionResultListener);

        // 2. 인식 에러 리스너 (이벤트 이름: onRecognitionError)
        recognitionErrorListener = ACRCloudModule.addListener('onRecognitionError', (error) => {
          // "No result" (code 1001)는 정상적인 실패 케이스이므로 에러가 아닌 정보로 처리
          const isNoResult = error?.code === 1001 || error?.error === 'No result';
          
          if (isNoResult) {
            console.log('[MusicRecognitionScreen] ℹ️ Recognition completed with no result (code 1001)');
            console.log('[MusicRecognitionScreen] ℹ️ This is a normal failure case, not an error');
          } else {
            console.error('[MusicRecognitionScreen] ❌ Recognition error received:', error);
            console.error('[MusicRecognitionScreen] ❌ Event name matches: onRecognitionError');
          }
          
          // 타임아웃 제거
          if (recordingTimeoutRef.current) {
            clearTimeout(recordingTimeoutRef.current);
            recordingTimeoutRef.current = null;
          }
          
          // 인식 중지
          if (ACRCloudModule && ACRCloudModule.stopRecognizing) {
            ACRCloudModule.stopRecognizing().catch(err => {
              console.error('[MusicRecognitionScreen] Error stopping recognition:', err);
            });
          }
          
          // Foreground Service 중지
          if (Platform.OS === 'android') {
            try {
              const { MusicRecognitionService } = NativeModules;
              if (MusicRecognitionService) {
                MusicRecognitionService.stopService();
                console.log('[MusicRecognitionScreen] ✅ Foreground Service stopped (recognition error)');
              }
            } catch (error) {
              console.warn('[MusicRecognitionScreen] ⚠️ Failed to stop Foreground Service:', error);
            }
          }
          
          setIsRecognizing(false);
          
          // 에러 메시지 처리
          // "No result" (code 1001)는 ACRCloud DB에 해당 음악이 없다는 의미
          // 다른 에러는 일반적인 인식 실패 메시지 표시
          let errorMessage;
          if (isNoResult) {
            // ACRCloud DB에 없는 경우
            errorMessage = t.musicRecognitionNoResult || '음악을 찾을 수 없습니다.\n\n- 음악의 다른 구간을 시도해보세요\n- 다른 곡으로 다시 시도해보세요';
          } else {
            // 다른 에러 (마이크 문제, 음악 재생 안 됨 등)
            errorMessage = t.musicRecognitionFailed || '음악을 인식하지 못했습니다.\n\n- 음악이 재생 중인지 확인하세요\n- 마이크가 음악 소리를 들을 수 있는지 확인하세요\n- 주변이 너무 시끄럽지 않은지 확인하세요';
          }
          
          // 화면에 에러 메시지 표시 (Alert 대신)
          setRecognitionError(errorMessage);
          
          // 알림 발송 (백그라운드에서도 알림 받을 수 있도록)
          sendRecognitionFailedNotification(errorMessage);
        });
        console.log('[MusicRecognitionScreen] ✅ Listener registered: onRecognitionError');

        // 3. 볼륨 변화 리스너 (이벤트 이름: onVolumeChanged) - 마이크 작동 여부 확인용
        volumeChangedListener = ACRCloudModule.addListener('onVolumeChanged', (data) => {
          // 볼륨이 0보다 클 때만 로그 출력 (볼륨이 0일 때는 이벤트가 오지 않도록 네이티브에서 처리)
          if (data.volume > 0.0) {
            console.log('[MusicRecognitionScreen] 🔊 🔊 🔊 Volume changed:', data.volume);
            console.log('[MusicRecognitionScreen] ✅ ✅ ✅ Microphone is working! Receiving audio input.');
            console.log('[MusicRecognitionScreen] 🔊 This confirms the microphone is capturing sound!');
            console.log('[MusicRecognitionScreen] 🔊 Event name matches: onVolumeChanged');
            
            // 볼륨이 0에 가까우면 경고 (앱이 포그라운드에 있을 때만)
            if (data.volume < 0.01 && appStateRef.current === 'active') {
              console.warn('[MusicRecognitionScreen] ⚠️ Volume is very low! Make sure music is playing loudly.');
              // 백그라운드에서는 알림을 표시하지 않음
            }
          }
        });
        console.log('[MusicRecognitionScreen] ✅ Listener registered: onVolumeChanged');
        console.log('[MusicRecognitionScreen] 📝 All event listeners registered successfully!');
        console.log('[MusicRecognitionScreen] 📝 If you see 🔊 Volume changed messages, microphone is working.');

        console.log('[MusicRecognitionScreen] ✅ Event listeners registered');
      } else {
        console.warn('[MusicRecognitionScreen] ⚠️ ACRCloudModule not available or addListener not supported');
      }
    } catch (listenerError) {
      console.warn('[MusicRecognitionScreen] ⚠️ Error setting up event listeners (non-fatal):', listenerError.message);
      // 이벤트 리스너 설정 실패해도 앱은 계속 실행
    }

    return () => {
      console.log('[MusicRecognitionScreen] Cleaning up...');
      clearTimeout(initTimeout);
      console.log('[MusicRecognitionScreen] Removing event listeners...');
      try {
        recognitionResultListener?.remove();
        recognitionErrorListener?.remove();
        volumeChangedListener?.remove();
      } catch (cleanupError) {
        console.warn('[MusicRecognitionScreen] ⚠️ Error removing listeners:', cleanupError.message);
      }
    };
  }, []); // 컴포넌트 마운트 시 한 번만 초기화

  // AppState 감지 (백그라운드/포그라운드 전환)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      console.log('[MusicRecognitionScreen] AppState changed:', appStateRef.current, '->', nextAppState);
      const prevState = appStateRef.current;
      appStateRef.current = nextAppState;
      
      // 포그라운드에서 백그라운드로 갔을 때: 인식 계속
      if (prevState === 'active' && nextAppState !== 'active') {
        console.log('[MusicRecognitionScreen] 📱 App went to background, continuing recognition...');
        shouldContinueRecognitionRef.current = true;
        if (isRecognizing) {
          console.log('[MusicRecognitionScreen] 📱 Recognition continues in background');
        }
      }
      
      // 백그라운드에서 포그라운드로 돌아왔을 때
      if (prevState !== 'active' && nextAppState === 'active') {
        console.log('[MusicRecognitionScreen] 📱 App returned to foreground');
        
        // 알림을 눌러서 돌아온 경우는 알림 리스너에서 이미 인식 중지 처리됨
        // 일반 앱 전환으로 돌아온 경우:
        // - 인식 결과가 있으면 → 인식 중지 (이미 결과가 나왔으니)
        // - 인식 결과가 없으면 → 인식 계속 (아직 결과가 없으니)
        if (isRecognizing) {
          if (recognitionResult) {
            // 인식 결과가 이미 있으면 중지
            console.log('[MusicRecognitionScreen] 📱 Recognition result exists, stopping recognition...');
            shouldContinueRecognitionRef.current = false;
            stopRecognition();
          } else {
            // 인식 결과가 없으면 계속 인식
            console.log('[MusicRecognitionScreen] 📱 No recognition result yet, continuing recognition...');
            shouldContinueRecognitionRef.current = true;
            // UI 상태 업데이트 (포그라운드에 있으므로 안전)
            setIsRecognizing(true);
          }
        }
      }
      
      // 이미 백그라운드에 있을 때는 인식 계속
      if (nextAppState !== 'active' && prevState !== 'active') {
        shouldContinueRecognitionRef.current = true;
        if (isRecognizing) {
          console.log('[MusicRecognitionScreen] 📱 App in background, continuing recognition...');
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isRecognizing]);

  // 알림 리스너 설정
  useEffect(() => {
    const notificationListeners = setupNotificationListeners(
      (notification) => {
        console.log('[MusicRecognitionScreen] 📬 Notification received:', notification);
      },
      (response) => {
        console.log('[MusicRecognitionScreen] 📬 Notification tapped:', response);
        const data = response.notification.request.content.data;
        
        // 음악 인식 결과 알림인 경우
        if (data?.type === 'recognition') {
          // 인식 중지 (알림을 눌러서 돌아왔으므로)
          console.log('[MusicRecognitionScreen] 🛑 Stopping recognition (notification tapped)');
          shouldContinueRecognitionRef.current = false; // 인식 계속 플래그 비활성화
          if (isRecognizing) {
            stopRecognition();
          }
          
          // 결과 표시
          setRecognitionResult({
            title: data.title || '',
            artist: data.artist || '',
            album: data.album || '',
          });
          
          // YouTube 검색
          if (data.title) {
            searchOnYouTube(data.title, data.artist || '');
          }
          
          // 음악 인식 화면으로 이동
          navigation.navigate('MusicRecognition');
        }
      }
    );

    return () => {
      notificationListeners.remove();
    };
  }, [navigation]);

  // 알림 권한 요청
  useEffect(() => {
    requestNotificationPermission().then(hasPermission => {
      if (hasPermission) {
        console.log('[MusicRecognitionScreen] ✅ Notification permission granted');
      } else {
        console.warn('[MusicRecognitionScreen] ⚠️ Notification permission not granted');
      }
    });
  }, []);

  // 녹음 중지 및 정리
  useEffect(() => {
    return () => {
      stopRecognition();
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
    };
  }, []);

  // 펄스 애니메이션
  useEffect(() => {
    if (isRecognizing) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecognizing]);

  // 샤잠 스타일 동심원 펄스 애니메이션
  useEffect(() => {
    if (!isRecognizing) {
      circleAnims.forEach(({ scale, opacity }) => {
        scale.setValue(0.6);
        opacity.setValue(0);
      });
      return;
    }
    const anims = circleAnims.map(({ scale, opacity }, i) => {
      const delay = i * 400;
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scale, { toValue: 2.2, duration: 2000, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 2000, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(scale, { toValue: 0.6, duration: 1, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.4, duration: 1, useNativeDriver: true }),
          ]),
        ]),
        { iterations: -1 }
      );
    });
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, [isRecognizing]);

  // 마이크 권한 확인 및 요청 (Android)
  const requestMicrophonePermission = async () => {
    if (Platform.OS !== 'android') {
      // iOS는 expo-av 사용
      const { status } = await Audio.requestPermissionsAsync();
      return status === 'granted';
    }

    try {
      // Android 14+ (API 34+)에서는 FOREGROUND_SERVICE_MICROPHONE 권한도 필요
      const androidVersion = Platform.Version;
      const needsForegroundServicePermission = androidVersion >= 34; // Android 14+
      
      // 1. RECORD_AUDIO 권한 확인 및 요청
      let hasRecordAudio = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );

      console.log('[MusicRecognitionScreen] 🔍 Current RECORD_AUDIO permission status:', hasRecordAudio);

      if (!hasRecordAudio) {
        console.log('[MusicRecognitionScreen] 🎤 RECORD_AUDIO permission not granted, requesting...');
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: t.musicRecognitionPermissionTitle,
            message: t.musicRecognitionPermissionMessage,
            buttonNeutral: t.later,
            buttonNegative: t.cancel,
            buttonPositive: t.allow,
          }
        );

        console.log('[MusicRecognitionScreen] 🎤 RECORD_AUDIO permission request result:', granted);

        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          hasRecordAudio = true;
          console.log('[MusicRecognitionScreen] ✅ RECORD_AUDIO permission granted');
        } else if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
          console.log('[MusicRecognitionScreen] ⚠️ RECORD_AUDIO permission denied with NEVER_ASK_AGAIN');
          Alert.alert(
            t.musicRecognitionPermissionTitle,
            t.musicRecognitionPermissionDeniedSettings,
            [
              { text: t.cancel, style: 'cancel' },
              { 
                text: t.openSettings, 
                onPress: () => {
                  Linking.openSettings();
                }
              },
            ]
          );
          return false;
        } else {
          console.log('[MusicRecognitionScreen] ❌ RECORD_AUDIO permission denied');
          return false;
        }
      }

      // 2. Android 14+에서는 FOREGROUND_SERVICE_MICROPHONE 권한도 확인 및 요청
      if (needsForegroundServicePermission) {
        const hasForegroundService = await PermissionsAndroid.check(
          'android.permission.FOREGROUND_SERVICE_MICROPHONE'
        );

        console.log('[MusicRecognitionScreen] 🔍 Current FOREGROUND_SERVICE_MICROPHONE permission status:', hasForegroundService);
        console.log('[MusicRecognitionScreen] 📱 Android version:', androidVersion);

        if (!hasForegroundService) {
          console.log('[MusicRecognitionScreen] 🎤 FOREGROUND_SERVICE_MICROPHONE permission not granted, requesting...');
          try {
            const granted = await PermissionsAndroid.request(
              'android.permission.FOREGROUND_SERVICE_MICROPHONE',
              {
                title: t.musicRecognitionPermissionTitle,
                message: '백그라운드에서 음악 인식을 위해 마이크 포그라운드 서비스 권한이 필요합니다.',
                buttonNeutral: t.later,
                buttonNegative: t.cancel,
                buttonPositive: t.allow,
              }
            );

            console.log('[MusicRecognitionScreen] 🎤 FOREGROUND_SERVICE_MICROPHONE permission request result:', granted);

            if (granted === PermissionsAndroid.RESULTS.GRANTED) {
              console.log('[MusicRecognitionScreen] ✅ FOREGROUND_SERVICE_MICROPHONE permission granted');
            } else {
              console.log('[MusicRecognitionScreen] ⚠️ FOREGROUND_SERVICE_MICROPHONE permission denied');
              // FOREGROUND_SERVICE_MICROPHONE 권한이 없어도 계속 진행 (일부 기기에서는 자동으로 부여될 수 있음)
              // 하지만 서비스 시작 시 에러가 발생할 수 있으므로 경고만 표시
            }
          } catch (err) {
            console.warn('[MusicRecognitionScreen] ⚠️ Error requesting FOREGROUND_SERVICE_MICROPHONE permission:', err);
            // 권한 요청 실패해도 계속 진행 (일부 기기에서는 자동으로 부여될 수 있음)
          }
        } else {
          console.log('[MusicRecognitionScreen] ✅ FOREGROUND_SERVICE_MICROPHONE permission already granted');
        }
      }

      // RECORD_AUDIO 권한이 있으면 성공
      return hasRecordAudio;
    } catch (err) {
      console.error('[MusicRecognitionScreen] ❌ Error requesting microphone permission:', err);
      return false;
    }
  };

  // 음악 인식 시작
  const startRecognition = async () => {
    try {
      console.log('[MusicRecognitionScreen] 🎵 Starting music recognition...');
      console.log('[MusicRecognitionScreen] ========================================');
      console.log('[MusicRecognitionScreen] ⚠️ IMPORTANT: Make sure only ONE song is playing');
      console.log('[MusicRecognitionScreen] ⚠️ If multiple songs are playing, recognition may be inaccurate');
      console.log('[MusicRecognitionScreen] Step 1: Checking microphone permission...');
      
      // 인식 시작 시 플래그 활성화
      shouldContinueRecognitionRef.current = true;
      
      // 마이크 권한 확인 및 요청 (중요: 서비스 시작 전에 먼저 권한 확인 필요)
      // Android 14+ (targetSDK 36)에서는 FOREGROUND_SERVICE_MICROPHONE 사용 시 RECORD_AUDIO 권한이 먼저 필요
      const hasPermission = await requestMicrophonePermission();
      console.log('[MusicRecognitionScreen] Step 1 Result: Permission granted =', hasPermission);
      
      if (!hasPermission) {
        console.log('[MusicRecognitionScreen] ❌ Step 1 FAILED: Microphone permission denied by user');
        Alert.alert(
          t.notice,
          t.musicRecognitionPermissionDenied + '\n\n' + t.musicRecognitionPermissionSettingsPath,
          [
            { text: t.cancel, style: 'cancel' },
            { text: t.openSettings, onPress: () => {
              // 설정 앱 열기
              if (Platform.OS === 'android') {
                Linking.openSettings();
              }
            }},
          ]
        );
        return;
      }
      
      console.log('[MusicRecognitionScreen] ✅ Step 1: Microphone permission OK');
      
      // 권한 확인 후 Foreground Service 시작 (Android 14+에서는 권한이 있어야 서비스 시작 가능)
      if (Platform.OS === 'android') {
        try {
          const { MusicRecognitionService } = NativeModules;
          if (MusicRecognitionService) {
            MusicRecognitionService.startService();
            console.log('[MusicRecognitionScreen] ✅ Foreground Service started for background microphone access');
          }
        } catch (error) {
          console.warn('[MusicRecognitionScreen] ⚠️ Failed to start Foreground Service:', error);
          // Foreground Service 시작 실패해도 계속 진행 (권한 문제일 수 있음)
        }
      }
      
      // 알림 권한 확인 (백그라운드 모드에서 알림 발송을 위해 필요)
      const hasNotificationPermission = await requestNotificationPermission();
      if (!hasNotificationPermission) {
        console.warn('[MusicRecognitionScreen] ⚠️ Notification permission not granted, but continuing...');
      } else {
        console.log('[MusicRecognitionScreen] ✅ Notification permission OK');
      }
      
      console.log('[MusicRecognitionScreen] Step 2: Ensuring ACRCloud is initialized...');
      
      // ✅ 권한 확인 후 ACRCloud 초기화 확인 및 재시도
      if (Platform.OS === 'android' && ACRCloudModule) {
        const isInit = await ACRCloudModule.isInitialized?.();
        console.log('[MusicRecognitionScreen] ACRCloud initialized:', isInit);
        
        if (!isInit) {
          console.log('[MusicRecognitionScreen] ACRCloud not initialized, initializing now...');
          try {
            // ACRCloud 프로젝트 정보
            const accessKey = 'b01665eac8c9b3032f229e8cb9a3e702';
            const accessSecret = 'T4GxjwxQZ9nngfwLmyu3hy20Fp2jJGVqLI4nCvD7';
            const host = 'identify-ap-southeast-1.acrcloud.com';
            
            // 주변 소리 모드만 사용 (마이크 모드)
            if (ACRCloudModule.setInternalAudioMode) {
              await ACRCloudModule.setInternalAudioMode(false);
              console.log('[MusicRecognitionScreen] Audio mode: Microphone (external sound)');
            }
            
            const initResult = await ACRCloudModule.initialize(accessKey, accessSecret, host);
            console.log('[MusicRecognitionScreen] Initialize result:', initResult);
            
            if (!initResult) {
              console.error('[MusicRecognitionScreen] ❌ ACRCloud initialization failed');
              Alert.alert(t.error, 'ACRCloud 초기화에 실패했습니다. 앱을 재시작해주세요.');
              setIsRecognizing(false);
              return;
            }
            
            console.log('[MusicRecognitionScreen] ✅ ACRCloud initialized successfully');
          } catch (error) {
            console.error('[MusicRecognitionScreen] ❌ Error initializing ACRCloud:', error);
            Alert.alert(t.error, `ACRCloud 초기화 실패: ${error.message}`);
            setIsRecognizing(false);
            return;
          }
        } else {
          console.log('[MusicRecognitionScreen] ✅ ACRCloud already initialized');
        }
      }
      
      console.log('[MusicRecognitionScreen] Step 3: Checking recognition engine (Shazam → ACRCloud 2-way fallback)...');

      // 2중 폴백: Shazam (1순위) → ACRCloud (2순위)
      if (Platform.OS === 'android' && ShazamModule?.isAvailable?.()) {
        try {
          console.log('[MusicRecognitionScreen] Step 3a: Trying Shazam first...');
          if (appStateRef.current === 'active') setIsRecognizing(true);
          let shazamSucceeded = false;
          const handleShazamResult = (result) => {
            if (shazamSucceeded) return;
            shazamSucceeded = true;
            if (recordingTimeoutRef.current) {
              clearTimeout(recordingTimeoutRef.current);
              recordingTimeoutRef.current = null;
            }
            const newResult = {
              title: result?.title || '',
              artist: result?.artist || '',
              album: result?.album || '',
            };
            setIsRecognizing(false);
            setRecognitionResult(newResult);
            setRecognitionError(null);
            if (ACRCloudModule?.stopRecognizing) ACRCloudModule.stopRecognizing().catch(() => {});
            if (Platform.OS === 'android') {
              try {
                const { MusicRecognitionService } = NativeModules;
                if (MusicRecognitionService) MusicRecognitionService.stopService();
              } catch (_) {}
            }
            sendRecognitionNotification(newResult.title, newResult.artist, newResult);
            if (result?.title) searchOnYouTube(result.title, result?.artist || '');
          };

          let resolveShazamWait = null;
          const shazamWaitPromise = new Promise((r) => { resolveShazamWait = r; });
          const handleShazamResultWithResolve = (result) => {
            handleShazamResult(result);
            if (typeof resolveShazamWait === 'function') resolveShazamWait();
          };
          const shazamListener = ShazamModule.addListener?.('onRecognitionResult', handleShazamResultWithResolve);
          await ShazamModule.startRecognizing?.();
          const timeoutId = setTimeout(() => { if (typeof resolveShazamWait === 'function') resolveShazamWait(); }, 15000);
          await shazamWaitPromise;
          clearTimeout(timeoutId);
          shazamListener?.remove?.();
          await ShazamModule.stopRecognizing?.().catch(() => {});

          if (shazamSucceeded) {
            console.log('[MusicRecognitionScreen] ✅ Shazam recognition succeeded, not using ACRCloud');
            return;
          }
          console.log('[MusicRecognitionScreen] Step 3b: Shazam no result, falling back to ACRCloud...');
        } catch (shazamError) {
          console.log('[MusicRecognitionScreen] Shazam failed, using ACRCloud:', shazamError?.message);
        }
      } else {
        console.log('[MusicRecognitionScreen] Shazam not available, using ACRCloud directly');
      }

      // 이전 결과 초기화 (새 인식을 위해 - 샤잠처럼 매번 새로 시작)
      console.log('[MusicRecognitionScreen] 🔄 Clearing previous results for new recognition...');
      console.log('[MusicRecognitionScreen] 🔄 Previous result:', recognitionResult);
      console.log('[MusicRecognitionScreen] 🔄 Previous YouTube results count:', youtubeResults.length);
      
      // 이전 결과 완전히 초기화
      setRecognitionResult(null);
      setYoutubeResults([]);
      setLoadingYoutube(false);
      setRecognitionError(null); // 에러 메시지도 초기화
      
      // 타임아웃도 초기화
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
      
      // 🔥 이전 인식이 진행 중이면 먼저 완전히 중지 (버퍼 정리는 네이티브에서 처리)
      if (Platform.OS === 'android' && ACRCloudModule) {
        try {
          const wasRecognizing = await ACRCloudModule.isRecognizing?.();
          if (wasRecognizing) {
            console.log('[MusicRecognitionScreen] 🔄 Previous recognition in progress, stopping first...');
            await ACRCloudModule.stopRecognizing();
            // 버퍼 정리는 네이티브(startRecognizing)에서 처리하므로 여기서는 대기하지 않음
            console.log('[MusicRecognitionScreen] ✅ Previous recognition stopped (buffer will be cleared in native)');
          }
        } catch (error) {
          console.warn('[MusicRecognitionScreen] ⚠️ Error stopping previous recognition:', error);
          // 에러가 나도 계속 진행
        }
      }
      
      // 인식 시작 (포그라운드에 있을 때만 UI 상태 업데이트)
      // 백그라운드에서 UI 상태를 변경하면 에러가 발생할 수 있으므로 안전하게 처리
      if (appStateRef.current === 'active') {
        setIsRecognizing(true);
      }
      console.log('[MusicRecognitionScreen] ✅ State cleared, starting new recognition');

      if (Platform.OS === 'android' && ACRCloudModule) {
        // ACRCloud로 음악 인식 시작
        console.log('[MusicRecognitionScreen] Step 4: Starting ACRCloud recognition...');
        console.log('[MusicRecognitionScreen] ACRCloudModule:', ACRCloudModule);
        
        const startResult = await ACRCloudModule.startRecognizing();
        console.log('[MusicRecognitionScreen] Step 4: Start recognition result:', startResult);
        
        if (!startResult) {
          console.error('[MusicRecognitionScreen] ❌ Failed to start recognition');
          Alert.alert(
            t.notice || '알림',
            t.musicRecognitionStartError || '음악 인식을 시작할 수 없습니다.'
          );
          setIsRecognizing(false);
          return;
        }
        
        console.log('[MusicRecognitionScreen] ✅ Step 4: Recognition started successfully');
        console.log('[MusicRecognitionScreen] ⏳ Waiting for recognition result...');
        console.log('[MusicRecognitionScreen] 📱 Listening for onRecognitionResult event...');
        console.log('[MusicRecognitionScreen] ========================================');
        console.log('[MusicRecognitionScreen] 🔍 DEBUGGING INFO:');
        console.log('[MusicRecognitionScreen]   - Audio mode: Microphone (external sound)');
        console.log('[MusicRecognitionScreen]   - Make sure music is playing and microphone can hear it');
        console.log('[MusicRecognitionScreen] 🔍 Check logcat for "ACRCloudModule" tag');
        console.log('[MusicRecognitionScreen] 🔍 Look for "🔊 Volume changed" messages - if you see them, audio input is working');
        console.log('[MusicRecognitionScreen] 🚫 If NO volume messages appear, audio is NOT being received');
        console.log('[MusicRecognitionScreen] ========================================');
        
        // 최대 25초 후 자동 중지 (인식 결과를 받으면 자동으로 중지되므로 타임아웃은 백업용)
        recordingTimeoutRef.current = setTimeout(() => {
          console.log('[MusicRecognitionScreen] ⏰ Auto-stopping recognition after 25 seconds (no result received)');
          stopRecognition();
          
          // 결과가 없으면 화면에 에러 메시지 표시 및 알림 발송
          if (!recognitionResult) {
            const errorMessage = t.musicRecognitionFailed || '음악을 인식하지 못했습니다.\n\n- 음악이 재생 중인지 확인하세요\n- 마이크가 음악 소리를 들을 수 있는지 확인하세요\n- 주변이 너무 시끄럽지 않은지 확인하세요';
            setRecognitionError(errorMessage);
            sendRecognitionFailedNotification(errorMessage);
          }
        }, 25000); // 25초로 설정 (인식 결과를 받으면 자동 중지되므로)
      } else {
        // iOS 또는 ACRCloud가 없는 경우: expo-av로 녹음만 (실제 인식은 서버에서)
        const { recording: newRecording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        setRecording(newRecording);
        console.log('[MusicRecognitionScreen] Recording started');

        // 최대 25초 후 자동 중지
        recordingTimeoutRef.current = setTimeout(async () => {
          await stopRecognition();
        }, 25000);
      }
    } catch (error) {
      console.error('[MusicRecognitionScreen] Error starting recognition:', error);
      Alert.alert(
        t.notice || '알림',
        t.musicRecognitionStartError || '음악 인식을 시작할 수 없습니다.'
      );
      setIsRecognizing(false);
    }
  };

  // 음악 인식 중지
  const stopRecognition = async () => {
    try {
      console.log('[MusicRecognitionScreen] 🛑 Stopping recognition...');
      
      // 인식 계속 플래그 비활성화
      shouldContinueRecognitionRef.current = false;
      
      // Foreground Service 중지 (Android)
      if (Platform.OS === 'android') {
        try {
          const { MusicRecognitionService } = NativeModules;
          if (MusicRecognitionService) {
            MusicRecognitionService.stopService();
            console.log('[MusicRecognitionScreen] ✅ Foreground Service stopped');
          }
        } catch (error) {
          console.warn('[MusicRecognitionScreen] ⚠️ Failed to stop Foreground Service:', error);
        }
      }
      
      // 타임아웃 제거
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }

      if (Platform.OS === 'android' && ACRCloudModule) {
        // ACRCloud로 음악 인식 중지
        await ACRCloudModule.stopRecognizing();
        console.log('[MusicRecognitionScreen] ✅ ACRCloud recognition stopped');
      }
      await ShazamModule?.stopRecognizing?.().catch(() => {});
      if (Platform.OS !== 'android' || !ACRCloudModule) {
        // expo-av 녹음 중지
        if (recording) {
          await recording.stopAndUnloadAsync();
          const uri = recording.getURI();
          console.log('[MusicRecognitionScreen] Recording stopped:', uri);
          setRecording(null);
        }
      }

      setIsRecognizing(false);
      console.log('[MusicRecognitionScreen] ✅ Ready for next recognition');
    } catch (error) {
      console.error('[MusicRecognitionScreen] ❌ Error stopping recognition:', error);
      Alert.alert(
        t.notice || '알림',
        t.musicRecognitionStopError || '음악 인식을 중지할 수 없습니다.'
      );
      setIsRecognizing(false);
    }
  };

  // YouTube에서 검색 (샤잠처럼 자동으로 검색)
  const searchOnYouTube = async (title, artist) => {
    try {
      console.log('[MusicRecognitionScreen] 🔍 Starting YouTube search...');
      console.log('[MusicRecognitionScreen] 🔍 Search query:', `${title} ${artist}`.trim());
      setLoadingYoutube(true);
      setYoutubeResults([]); // 이전 결과 초기화
      
      const searchQuery = `${title} ${artist}`.trim();
      const results = await searchVideos(searchQuery, 10);
      
      console.log('[MusicRecognitionScreen] ✅ YouTube search completed');
      console.log('[MusicRecognitionScreen] 📝 Results count:', results.length);
      setYoutubeResults(results);
      
      if (results.length === 0) {
        console.warn('[MusicRecognitionScreen] ⚠️ No YouTube results found');
      }
    } catch (error) {
      console.error('[MusicRecognitionScreen] ❌ Error searching YouTube:', error);
        Alert.alert(t.error, t.youtubeSearchError || t.musicRecognitionSearchingYouTube);
      setYoutubeResults([]);
    } finally {
      setLoadingYoutube(false);
    }
  };

  // 즐겨찾기 목록 로드
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const favs = await getFavorites();
        const favoriteIds = new Set(favs.map(fav => fav.id || fav.video_id));
        setFavorites(favoriteIds);
      } catch (error) {
        console.error('[MusicRecognitionScreen] Error loading favorites:', error);
      }
    };
    loadFavorites();
  }, []);

  // 유튜브에서 재생
  const handleOpenVideo = async (item) => {
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${item.id}`;
      console.log('[MusicRecognitionScreen] Opening video URL:', videoUrl);
      
      const canOpen = await Linking.canOpenURL(videoUrl);
      if (canOpen) {
        await Linking.openURL(videoUrl);
      } else {
        Alert.alert(t.error || '오류', t.cannotOpenVideo);
      }
    } catch (error) {
      console.error('[MusicRecognitionScreen] Error opening video:', error);
      Alert.alert(t.error || '오류', t.cannotOpenVideo);
    }
  };

  // 즐겨찾기 추가/제거
  const handleAddFavorite = async (item) => {
    try {
      const isFav = favorites.has(item.id);
      if (isFav) {
        // 즐겨찾기 제거
        await removeFavorite(item.id);
        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(item.id);
          return newSet;
        });
        console.log('[MusicRecognitionScreen] Favorite removed:', item.id);
      } else {
        // 즐겨찾기 추가
        await addFavorite({
          id: item.id,
          title: item.title,
          url: `https://www.youtube.com/watch?v=${item.id}`,
          thumbnail: item.thumbnail,
          author: item.channelTitle,
          authorUrl: item.channelId ? `https://www.youtube.com/channel/${item.channelId}` : '',
        });
        setFavorites(prev => new Set(prev).add(item.id));
        console.log('[MusicRecognitionScreen] Favorite added:', item.id);
      }
    } catch (error) {
      console.error('[MusicRecognitionScreen] Error toggling favorite:', error);
      Alert.alert(t.error || '오류', t.favoriteSaveError);
    }
  };

  // YouTube 결과에서 다운로드
  const handleDownload = (item, isVideo) => {
    navigation.navigate('Search', {
      url: `https://www.youtube.com/watch?v=${item.id}`,
      timestamp: Date.now(),
      forceUpdate: true,
    });
  };


  // 렌더링 시 recognitionResult 확인 (디버깅용)
  if (recognitionResult) {
    console.log('[MusicRecognitionScreen] 🎨 RENDERING - recognitionResult:', recognitionResult);
    console.log('[MusicRecognitionScreen] 🎨 RENDERING - will show result: true');
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#FF0000" />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        {/* 헤더 - 검색 화면과 동일한 스타일 */}
        <View style={styles.header}>
        <TouchableOpacity 
          style={styles.logoContainer}
          onPress={() => {
            navigation.navigate('MusicRecognition');
          }}
          activeOpacity={0.7}
        >
          <Image 
            source={require('../../assets/icon.png')} 
            style={styles.logoImage}
            resizeMode="cover"
          />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <HeaderTitle title={t.appTitle} />
        </View>
        <LanguageSelector />
        </View>
      </SafeAreaView>

      {/* 메인 컨텐츠 */}
      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
      >
        {/* 인식 영역 - 샤잠 스타일 파란 그라데이션 + 동심원 */}
        <View style={styles.recognitionArea}>
          <LinearGradient
            colors={['#0055A4', '#007AFF', '#0047AB']}
            style={styles.recognitionGradient}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          >
            {/* 동심원 펄스 (인식 중일 때만) */}
            {circleAnims.map(({ scale, opacity }, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.pulseCircle,
                  {
                    transform: [{ scale }],
                    opacity,
                  },
                ]}
              />
            ))}
            {/* 중앙 버튼 */}
            <TouchableOpacity
              style={styles.recognitionButton}
              onPress={isRecognizing ? stopRecognition : startRecognition}
              disabled={loadingYoutube}
              activeOpacity={0.9}
            >
              <Animated.View
                style={[
                  styles.recognitionButtonInner,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              >
                <View style={styles.recognitionIconCircle}>
                  <Ionicons
                    name={isRecognizing ? 'stop' : 'mic'}
                    size={56}
                    color="#fff"
                  />
                </View>
              </Animated.View>
            </TouchableOpacity>
          </LinearGradient>

          <Text style={styles.recognitionText}>
            {isRecognizing
              ? t.musicRecognitionListening
              : t.musicRecognitionTapToStart}
          </Text>

          {isRecognizing && (
            <View style={styles.recognitionHints}>
              <Text style={styles.recognitionHint}>
                {t.musicRecognitionListeningHint}
              </Text>
              <Text style={styles.recognitionHint}>
                {t.musicRecognitionVolumeCheck}
              </Text>
            </View>
          )}

          {!isRecognizing && (
            <View style={styles.recognitionHints}>
              <Text style={styles.recognitionHint}>
                {t.musicRecognitionInstructions}
              </Text>
              <TouchableOpacity
                style={styles.permissionButton}
                onPress={async () => {
                  console.log('[MusicRecognitionScreen] 🔍 Manual permission check requested');
                  const hasPermission = await requestMicrophonePermission();
                  if (hasPermission) {
                    Alert.alert(t.notice, t.musicRecognitionPermissionGranted);
                  } else {
                    Alert.alert(
                      t.notice,
                      t.musicRecognitionPermissionRequired,
                      [
                        { text: t.cancel, style: 'cancel' },
                        { 
                          text: t.openSettings, 
                          onPress: () => Linking.openSettings()
                        },
                      ]
                    );
                  }
                }}
              >
                <Text style={styles.permissionButtonText}>
                  {t.musicRecognitionCheckPermission}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 인식 결과 - 인식된 곡 (문구는 카드 밖 위 → 카드: 썸네일 → 제목/아티스트/앨범, 글 복사 가능) */}
        {recognitionResult && (
          <View style={styles.resultArea}>
            <Text style={styles.recognitionResultLabel}>{t.musicRecognitionRecognizedSong}</Text>
            <View style={styles.recognitionResultCard}>
              {youtubeResults.length > 0 && youtubeResults[0].thumbnail ? (
                <Image
                  source={{ uri: youtubeResults[0].thumbnail }}
                  style={styles.recognitionThumbnail}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.recognitionThumbnailPlaceholder}>
                  <Ionicons name="musical-notes" size={64} color="#ccc" />
                </View>
              )}
              <View style={styles.recognitionResultContent}>
                <Text style={styles.recognitionResultTitle} selectable>
                  {recognitionResult.title || t.musicRecognitionNoTitle}
                </Text>
                <Text style={styles.recognitionResultArtist} selectable>
                  {recognitionResult.artist || t.musicRecognitionNoArtist}
                </Text>
                {recognitionResult.album ? (
                  <Text style={styles.recognitionResultAlbum} selectable>
                    {recognitionResult.album}
                  </Text>
                ) : null}
              </View>
            </View>
            {/* 인식된 곡 아래 쿠팡 광고 */}
            <AdBanner style={{ marginTop: 16 }} />
          </View>
        )}

        {/* YouTube 검색 결과 - 샤잠처럼 자동으로 표시 */}
        {loadingYoutube && (
          <View style={styles.loadingArea}>
            <ActivityIndicator size="large" color="#FF0000" />
            <Text style={styles.loadingText}>{t.musicRecognitionSearchingYouTube}</Text>
          </View>
        )}

        {youtubeResults.length > 0 && (
          <View style={styles.youtubeResultsArea}>
            <Text style={styles.youtubeResultsTitle}>
              {t.musicRecognitionSelectVideo}
            </Text>
            {youtubeResults.map((item, index) => (
              <React.Fragment key={item.id}>
                <TouchableOpacity
                  style={styles.youtubeResultCard}
                  onPress={() => handleOpenVideo(item)}
                  activeOpacity={0.8}
                >
                  {item.thumbnail ? (
                    <Image 
                      source={{ uri: item.thumbnail }} 
                      style={styles.youtubeThumbnail}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.youtubeThumbnailPlaceholder}>
                      <Ionicons name="videocam" size={48} color="#999" />
                    </View>
                  )}
                  <View style={styles.youtubeResultContent}>
                    <Text style={styles.youtubeResultTitleText} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.youtubeResultChannel} numberOfLines={1}>
                      {item.channelTitle}
                    </Text>
                    <View style={styles.youtubeResultActions}>
                      <TouchableOpacity 
                        style={styles.favoriteButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleAddFavorite(item);
                        }}
                      >
                        <Ionicons 
                          name={favorites.has(item.id) ? "star" : "star-outline"} 
                          size={18} 
                          color={favorites.has(item.id) ? "#FFD700" : "#999"} 
                        />
                        <Text style={styles.favoriteButtonText}>{t.addToFavorites || '찜하기'}</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        style={styles.playButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleOpenVideo(item);
                        }}
                      >
                        <Ionicons name="play-circle" size={18} color="#fff" />
                        <Text style={styles.playButtonText}>{t.play}</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={styles.downloadButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleDownload(item, true);
                        }}
                      >
                        <Ionicons name="download-outline" size={18} color="#fff" />
                        <Text style={styles.downloadButtonText}>{t.saveButton || '다운로드'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
                {/* 3개마다 쿠팡 광고 삽입 */}
                {(index + 1) % 3 === 0 && (
                  <AdBanner style={{ marginTop: 16, marginBottom: 16 }} />
                )}
              </React.Fragment>
            ))}
          </View>
        )}
        
        {/* 인식 결과가 있지만 YouTube 결과가 없을 때 */}
        {recognitionResult && !loadingYoutube && youtubeResults.length === 0 && (
          <View style={styles.loadingArea}>
            <Text style={styles.loadingText}>
              {t.musicRecognitionNoYouTubeResults}
            </Text>
          </View>
        )}
        
        {/* 인식 실패 메시지 표시 (Alert 대신 화면에 표시) */}
        {recognitionError && (
          <View style={styles.errorArea}>
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={24} color="#FF6B6B" style={styles.errorIcon} />
              <View style={styles.errorContent}>
                <Text style={styles.errorTitle}>{t.notice || '알림'}</Text>
                <Text style={styles.errorMessage}>{recognitionError}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.errorCloseButton}
              onPress={() => {
                setRecognitionError(null);
                // 다음 인식을 위해 상태 초기화
                setRecognitionResult(null);
                setYoutubeResults([]);
              }}
            >
              <Text style={styles.errorCloseButtonText}>{t.ok || '확인'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  safeArea: {
    backgroundColor: '#FF0000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FF0000',
    borderBottomWidth: 1,
    borderBottomColor: '#cc0000',
  },
  logoContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 44,
    height: 44,
    resizeMode: 'cover',
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  recognitionArea: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  recognitionGradient: {
    width: '100%',
    minHeight: 320,
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  pulseCircle: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'transparent',
  },
  recognitionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  recognitionButtonInner: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  recognitionIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  recognitionText: {
    marginTop: 24,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  recognitionHints: {
    marginTop: 12,
    alignItems: 'center',
  },
  recognitionHint: {
    marginTop: 4,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionButton: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'center',
  },
  permissionButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '400',
    textDecorationLine: 'underline',
  },
  resultArea: {
    marginTop: 20,
    marginBottom: 20,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  // 인식된 곡 카드 (썸네일 + 내용, 원래 디자인)
  recognitionResultCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  recognitionThumbnail: {
    width: '100%',
    height: 200,
    backgroundColor: '#ddd',
  },
  recognitionThumbnailPlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recognitionResultContent: {
    padding: 16,
  },
  recognitionResultLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  recognitionResultTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  recognitionResultArtist: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  recognitionResultAlbum: {
    fontSize: 14,
    color: '#999',
  },
  loadingArea: {
    alignItems: 'center',
    marginTop: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  youtubeResultsArea: {
    marginTop: 20,
  },
  youtubeResultsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  // YouTube 검색 결과 카드 (검색 화면과 비슷한 스타일)
  youtubeResultCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  youtubeThumbnail: {
    width: '100%',
    height: 200,
    backgroundColor: '#ddd',
  },
  youtubeThumbnailPlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  youtubeResultContent: {
    padding: 16,
  },
  youtubeResultTitleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    lineHeight: 22,
  },
  youtubeResultChannel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  youtubeResultActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  favoriteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFE5E5',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  favoriteButtonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  playButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  playButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  downloadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF0000',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  errorArea: {
    marginTop: 20,
    marginBottom: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  errorCard: {
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFE0E0',
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    marginBottom: 12,
  },
  errorIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  errorContent: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF6B6B',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  errorCloseButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCloseButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
