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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import AdBanner from '../components/AdBanner';
import LanguageSelector from '../components/LanguageSelector';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../locales/translations';
import { searchVideos } from '../services/downloadService';
import { addFavorite, removeFavorite, isFavorite, getFavorites } from '../services/database';
import ACRCloudModule from '../modules/ACRCloudModule';

export default function MusicRecognitionScreen({ navigation }) {
  const { currentLanguage } = useLanguage();
  const t = translations[currentLanguage];
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState(null);
  const [youtubeResults, setYoutubeResults] = useState([]);
  
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
  const recordingTimeoutRef = useRef(null);

  // ACRCloud 초기화 및 이벤트 리스너 설정
  useEffect(() => {
    const initializeACRCloud = async () => {
      try {
        console.log('[MusicRecognitionScreen] Initializing ACRCloud...');
        console.log('[MusicRecognitionScreen] Platform.OS:', Platform.OS);
        console.log('[MusicRecognitionScreen] ACRCloudModule:', ACRCloudModule);
        console.log('[MusicRecognitionScreen] useInternalAudio:', useInternalAudio);
        
        if (Platform.OS === 'android' && ACRCloudModule) {
          // ACRCloud 프로젝트 정보
          const accessKey = 'b01665eac8c9b3032f229e8cb9a3e702';
          const accessSecret = 'T4GxjwxQZ9nngfwLmyu3hy20Fp2jJGVqLI4nCvD7';
          const host = 'identify-ap-southeast-1.acrcloud.com';
          
          // 주변 소리 모드만 사용 (마이크 모드)
          if (ACRCloudModule.setInternalAudioMode) {
            await ACRCloudModule.setInternalAudioMode(false);
            console.log('[MusicRecognitionScreen] Audio mode: Microphone (external sound)');
          }
          
          // ACRCloud가 초기화되지 않았을 때만 초기화
          const isInitialized = await ACRCloudModule.isInitialized();
          console.log('[MusicRecognitionScreen] Is initialized:', isInitialized);
          
          if (!isInitialized) {
            console.log('[MusicRecognitionScreen] Calling initialize...');
            const initResult = await ACRCloudModule.initialize(accessKey, accessSecret, host);
            console.log('[MusicRecognitionScreen] Initialize result:', initResult);
            
            if (initResult) {
              console.log('[MusicRecognitionScreen] ✅ ACRCloud initialized successfully');
            } else {
              console.error('[MusicRecognitionScreen] ❌ ACRCloud initialization failed');
            }
          } else {
            console.log('[MusicRecognitionScreen] ACRCloud already initialized');
          }
        } else {
          console.warn('[MusicRecognitionScreen] ⚠️ ACRCloudModule not available');
        }
      } catch (error) {
        console.error('[MusicRecognitionScreen] ❌ Error initializing ACRCloud:', error);
        Alert.alert(t.error, `ACRCloud 초기화 실패: ${error.message}`);
      }
    };

    initializeACRCloud();

    // ACRCloud 이벤트 리스너 설정
    // Expo Modules에서는 모듈에서 직접 addListener를 사용해야 합니다
    if (Platform.OS === 'android' && ACRCloudModule) {
      console.log('[MusicRecognitionScreen] Setting up event listeners...');
      console.log('[MusicRecognitionScreen] ACRCloudModule:', ACRCloudModule);
      console.log('[MusicRecognitionScreen] 📝 Registering event listeners using Expo Modules...');
      
      // Expo Modules에서는 모듈에서 직접 addListener를 사용
      // 1. 인식 결과 리스너 (이벤트 이름: onRecognitionResult)
      const recognitionResultListener = ACRCloudModule.addListener('onRecognitionResult', (result) => {
          console.log('[MusicRecognitionScreen] ✅✅✅ Recognition result received:', result);
          console.log('[MusicRecognitionScreen] ✅ Event name matches: onRecognitionResult');
          console.log('[MusicRecognitionScreen] 📝 Result data:', JSON.stringify(result));
          console.log('[MusicRecognitionScreen] 📝 Result title:', result?.title);
          console.log('[MusicRecognitionScreen] 📝 Result artist:', result?.artist);
          console.log('[MusicRecognitionScreen] 📊 Result score (confidence):', result?.score);
          console.log('[MusicRecognitionScreen] 📊 Result playOffset:', result?.playOffset);
          
          // 인식 결과를 받았으므로 인식 중지 및 타임아웃 제거
          if (recordingTimeoutRef.current) {
            clearTimeout(recordingTimeoutRef.current);
            recordingTimeoutRef.current = null;
          }
          
          if (ACRCloudModule && ACRCloudModule.stopRecognizing) {
            ACRCloudModule.stopRecognizing().catch(err => {
              console.error('[MusicRecognitionScreen] Error stopping recognition:', err);
            });
          }
          
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
          
          console.log('[MusicRecognitionScreen] ✅ State updated - UI should refresh now');
          console.log('[MusicRecognitionScreen] ✅ Recognition stopped, ready for next recognition');
          
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
        const recognitionErrorListener = ACRCloudModule.addListener('onRecognitionError', (error) => {
          console.error('[MusicRecognitionScreen] ❌❌❌ Recognition error received:', error);
          console.error('[MusicRecognitionScreen] ❌ Event name matches: onRecognitionError');
          
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
          
          setIsRecognizing(false);
          Alert.alert(t.error, error.error || t.musicRecognitionStartError || '음악 인식에 실패했습니다.');
        });
        console.log('[MusicRecognitionScreen] ✅ Listener registered: onRecognitionError');

        // 3. 볼륨 변화 리스너 (이벤트 이름: onVolumeChanged) - 마이크 작동 여부 확인용
        const volumeChangedListener = ACRCloudModule.addListener('onVolumeChanged', (data) => {
          // 볼륨 변화는 로그만 출력 (필요시 UI에 표시 가능)
          console.log('[MusicRecognitionScreen] 🔊 🔊 🔊 Volume changed:', data.volume);
          console.log('[MusicRecognitionScreen] ✅ ✅ ✅ Microphone is working! Receiving audio input.');
          console.log('[MusicRecognitionScreen] 🔊 This confirms the microphone is capturing sound!');
          console.log('[MusicRecognitionScreen] 🔊 Event name matches: onVolumeChanged');
          
          // 볼륨이 0에 가까우면 경고
          if (data.volume < 0.01) {
            console.warn('[MusicRecognitionScreen] ⚠️ Volume is very low! Make sure music is playing loudly.');
            Alert.alert(
              t.notice,
              '볼륨이 너무 낮습니다.\n\n음악 볼륨을 크게 올려주세요.',
              [{ text: t.ok }]
            );
          }
        });
        console.log('[MusicRecognitionScreen] ✅ Listener registered: onVolumeChanged');
        console.log('[MusicRecognitionScreen] 📝 All event listeners registered successfully!');
        console.log('[MusicRecognitionScreen] 📝 If you see 🔊 Volume changed messages, microphone is working.');

        console.log('[MusicRecognitionScreen] ✅ Event listeners registered');

        return () => {
          console.log('[MusicRecognitionScreen] Removing event listeners...');
          recognitionResultListener?.remove();
          recognitionErrorListener?.remove();
          volumeChangedListener?.remove();
        };
      } else {
        console.warn('[MusicRecognitionScreen] ⚠️ ACRCloudModule not available');
      }
  }, []); // 컴포넌트 마운트 시 한 번만 초기화

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

  // 마이크 권한 확인 및 요청 (Android)
  const requestMicrophonePermission = async () => {
    if (Platform.OS !== 'android') {
      // iOS는 expo-av 사용
      const { status } = await Audio.requestPermissionsAsync();
      return status === 'granted';
    }

    try {
      // 먼저 권한이 이미 있는지 확인
      const hasPermission = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );

      console.log('[MusicRecognitionScreen] 🔍 Current microphone permission status:', hasPermission);

      if (hasPermission) {
        console.log('[MusicRecognitionScreen] ✅ Microphone permission already granted');
        return true;
      }

      console.log('[MusicRecognitionScreen] 🎤 Microphone permission not granted, requesting...');
      console.log('[MusicRecognitionScreen] 🎤 Showing permission request dialog...');
      
      // Android: PermissionsAndroid 사용
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

      console.log('[MusicRecognitionScreen] 🎤 Permission request result:', granted);
      console.log('[MusicRecognitionScreen] 🎤 GRANTED:', PermissionsAndroid.RESULTS.GRANTED);
      console.log('[MusicRecognitionScreen] 🎤 DENIED:', PermissionsAndroid.RESULTS.DENIED);
      console.log('[MusicRecognitionScreen] 🎤 NEVER_ASK_AGAIN:', PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);

      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        console.log('[MusicRecognitionScreen] ✅ Microphone permission granted');
        return true;
      } else if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        console.log('[MusicRecognitionScreen] ⚠️ Microphone permission denied with NEVER_ASK_AGAIN');
        // 설정으로 이동하도록 안내
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
        console.log('[MusicRecognitionScreen] ❌ Microphone permission denied');
        return false;
      }
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
      
      // 마이크 권한 확인 및 요청 (중요: 실제 런타임 권한 요청)
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
      
      
      console.log('[MusicRecognitionScreen] Step 2: Checking ACRCloud initialization...');

      // 이전 결과 초기화 (새 인식을 위해 - 샤잠처럼 매번 새로 시작)
      console.log('[MusicRecognitionScreen] 🔄 Clearing previous results for new recognition...');
      console.log('[MusicRecognitionScreen] 🔄 Previous result:', recognitionResult);
      console.log('[MusicRecognitionScreen] 🔄 Previous YouTube results count:', youtubeResults.length);
      
      // 이전 결과 완전히 초기화
      setRecognitionResult(null);
      setYoutubeResults([]);
      setLoadingYoutube(false);
      
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
      
      // 인식 시작
      setIsRecognizing(true);
      console.log('[MusicRecognitionScreen] ✅ State cleared, starting new recognition');

      if (Platform.OS === 'android' && ACRCloudModule) {
        // ACRCloud로 음악 인식 시작
        console.log('[MusicRecognitionScreen] Step 3: Starting ACRCloud recognition...');
        console.log('[MusicRecognitionScreen] ACRCloudModule:', ACRCloudModule);
        
        // 초기화 상태 확인
        const isInit = await ACRCloudModule.isInitialized?.();
        console.log('[MusicRecognitionScreen] ACRCloud initialized:', isInit);
        
        if (!isInit) {
          console.error('[MusicRecognitionScreen] ❌ ACRCloud not initialized!');
          Alert.alert(t.error, 'ACRCloud가 초기화되지 않았습니다. 앱을 재시작해주세요.');
          setIsRecognizing(false);
          return;
        }
        
        const startResult = await ACRCloudModule.startRecognizing();
        console.log('[MusicRecognitionScreen] Step 4: Start recognition result:', startResult);
        
        if (!startResult) {
          console.error('[MusicRecognitionScreen] ❌ Failed to start recognition');
          Alert.alert(t.error, t.musicRecognitionStartError);
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
        
        // 최대 15초 후 자동 중지 (인식 결과를 받으면 자동으로 중지되므로 타임아웃은 백업용)
        recordingTimeoutRef.current = setTimeout(() => {
          console.log('[MusicRecognitionScreen] ⏰ Auto-stopping recognition after 15 seconds (no result received)');
          stopRecognition();
          
          // 결과가 없으면 알림 표시
          if (!recognitionResult) {
            Alert.alert(
              t.notice,
              t.musicRecognitionFailed,
              [{ 
                text: t.ok,
                onPress: () => {
                  // 다음 인식을 위해 상태 초기화
                  setRecognitionResult(null);
                  setYoutubeResults([]);
                }
              }]
            );
          }
        }, 15000); // 15초로 설정 (인식 결과를 받으면 자동 중지되므로)
      } else {
        // iOS 또는 ACRCloud가 없는 경우: expo-av로 녹음만 (실제 인식은 서버에서)
        const { recording: newRecording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        setRecording(newRecording);
        console.log('[MusicRecognitionScreen] Recording started');

        // 최대 15초 후 자동 중지
        recordingTimeoutRef.current = setTimeout(async () => {
          await stopRecognition();
        }, 15000);
      }
    } catch (error) {
      console.error('[MusicRecognitionScreen] Error starting recognition:', error);
      Alert.alert(t.error, t.musicRecognitionStartError);
      setIsRecognizing(false);
    }
  };

  // 음악 인식 중지
  const stopRecognition = async () => {
    try {
      console.log('[MusicRecognitionScreen] 🛑 Stopping recognition...');
      
      // 타임아웃 제거
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }

      if (Platform.OS === 'android' && ACRCloudModule) {
        // ACRCloud로 음악 인식 중지
        await ACRCloudModule.stopRecognizing();
        console.log('[MusicRecognitionScreen] ✅ Recognition stopped');
      } else {
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
      Alert.alert(t.error, t.musicRecognitionStopError || '인식 중지 중 오류가 발생했습니다.');
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
          <Text style={styles.headerTitle}>MelodySnap</Text>
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
        {/* 인식 버튼 */}
        <View style={styles.recognitionArea}>
          <TouchableOpacity
            style={[
              styles.recognitionButton,
              isRecognizing && styles.recognitionButtonActive,
            ]}
            onPress={isRecognizing ? stopRecognition : startRecognition}
            disabled={loadingYoutube}
          >
            <Animated.View
              style={[
                styles.recognitionButtonInner,
                { transform: [{ scale: pulseAnim }] },
              ]}
            >
              <Ionicons
                name={isRecognizing ? 'stop' : 'mic'}
                size={64}
                color="#fff"
              />
            </Animated.View>
          </TouchableOpacity>

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
                {t.musicRecognitionHowToUse}
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

        {/* 인식 결과 - 검색 화면과 비슷한 카드 형태 */}
        {recognitionResult && (
          <View style={styles.resultArea}>
            <Text style={styles.resultTitle}>{t.musicRecognitionRecognizedSong}</Text>
            <View style={styles.recognitionResultCard}>
              {/* 썸네일은 YouTube 검색 결과의 첫 번째 항목에서 가져옴 */}
              {youtubeResults.length > 0 && youtubeResults[0].thumbnail ? (
                <Image 
                  source={{ uri: youtubeResults[0].thumbnail }} 
                  style={styles.recognitionThumbnail}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.recognitionThumbnailPlaceholder}>
                  <Ionicons name="musical-notes" size={64} color="#999" />
                </View>
              )}
              <View style={styles.recognitionResultContent}>
                <Text style={styles.recognitionResultTitle}>
                  {recognitionResult.title || t.musicRecognitionNoTitle}
                </Text>
                <Text style={styles.recognitionResultArtist}>
                  {recognitionResult.artist || t.musicRecognitionNoArtist}
                </Text>
                {recognitionResult.album && (
                  <Text style={styles.recognitionResultAlbum}>
                    {recognitionResult.album}
                  </Text>
                )}
              </View>
            </View>
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
            {youtubeResults.map((item) => (
              <TouchableOpacity
                key={item.id}
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
      </ScrollView>

      {/* 스크린샷 촬영을 위해 임시 주석처리 */}
      {/* <AdBanner /> */}
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
    width: 40,
    height: 40,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 12,
  },
  logoImage: {
    width: 40,
    height: 40,
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
    marginTop: 40,
    marginBottom: 40,
  },
  recognitionButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FF0000',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  recognitionButtonActive: {
    backgroundColor: '#cc0000',
  },
  recognitionButtonInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
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
  // 인식 결과 카드 (검색 화면과 비슷한 스타일)
  recognitionResultCard: {
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
});
