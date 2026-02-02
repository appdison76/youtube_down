import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Image,
  Platform,
  StatusBar,
  Linking,
  Alert,
  AppState,
  Modal,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AdBanner from '../components/AdBanner';
import LanguageSelector from '../components/LanguageSelector';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../locales/translations';
import { addFavorite, removeFavorite, isFavorite, initDatabase } from '../services/database';
import { downloadVideo, downloadAudio, resumeDownload, shareDownloadedFile, saveFileToDevice, getFileInfo, sanitizeFileName, getDownloadedFiles, cleanupIncompleteFiles, getVideoInfo, deleteFileWithMetadata, getThumbnailCachePath } from '../services/downloadService';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system/legacy';
import MediaStoreModule from '../modules/MediaStoreModule';

// 썸네일 이미지 컴포넌트 (영상 URL 실패 시 캐시로 폴백)
const ThumbnailImage = ({ sourceUri, cacheUri, style }) => {
  const [imageUri, setImageUri] = React.useState(sourceUri || cacheUri);
  
  const handleError = () => {
    // 영상 URL 로드 실패 시 캐시로 폴백
    if (imageUri !== cacheUri && cacheUri) {
      setImageUri(cacheUri);
    }
  };
  
  return (
    <Image
      source={{ uri: imageUri }}
      style={style}
      resizeMode="cover"
      onError={handleError}
    />
  );
};

export default function SearchScreen({ navigation, route }) {
  const { currentLanguage } = useLanguage();
  const t = translations[currentLanguage];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState(new Set()); // 즐겨찾기 ID Set
  const [downloading, setDownloading] = useState({}); // 다운로드 중인 항목 { videoId: { type: 'video'|'audio', progress: 0-1 } }
  const [downloadedFiles, setDownloadedFiles] = useState([]); // 다운로드한 파일 목록
  const [thumbnailCachePaths, setThumbnailCachePaths] = useState({}); // videoId -> cache path
  const [customAlert, setCustomAlert] = useState({ visible: false, title: '', message: '', subMessage: '', onConfirm: null });
  const textInputRef = useRef(null);
  const lastProcessedUrl = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current; // 비디오 아이콘 펄스 애니메이션
  
  // ✅ 커스텀 Alert 함수 (빨간 글씨 안내 메시지 포함)
  const showDownloadAlert = (hasExistingFile, isVideo = true) => {
    if (hasExistingFile) {
      // 커스텀 모달로 표시
      setCustomAlert({
        visible: true,
        title: t.notice,
        message: isVideo 
          ? t.videoSaveStarted
          : t.musicSaveStarted,
        subMessage: t.resaveHint,
        onConfirm: () => {
          setCustomAlert({ visible: false, title: '', message: '', subMessage: '', onConfirm: null });
        }
      });
    } else {
      // 기본 Alert 사용
      Alert.alert(
        t.notice,
        isVideo 
          ? t.videoSaveStarted
          : t.musicSaveStarted
      );
    }
  };
  
  // 앱 시작 시 입력 필드 초기화 (혹시 모를 기본값 제거)
  useEffect(() => {
    // route params에 URL이 없으면 입력 필드를 빈 문자열로 유지
    if (!route?.params?.url) {
      setQuery('');
    }
  }, []); // 컴포넌트 마운트 시 한 번만 실행

  // 데이터베이스 초기화 및 즐겨찾기 상태 로드
  useEffect(() => {
    initDatabase().then(() => {
      // 결과가 있을 때 즐겨찾기 상태 확인
      if (results.length > 0) {
        checkFavoritesStatus();
      }
    });
  }, []);

  // 즐겨찾기 상태 확인
  const checkFavoritesStatus = async () => {
    if (results.length === 0) return;
    
    // 데이터베이스가 초기화되었는지 확인
    try {
      await initDatabase();
    } catch (error) {
      console.error('[SearchScreen] Database not ready:', error);
      return; // 데이터베이스가 준비되지 않았으면 종료
    }
    
    const favoritesSet = new Set();
    for (const item of results) {
      try {
        const isFav = await isFavorite(item.id);
        if (isFav) {
          favoritesSet.add(item.id);
        }
      } catch (error) {
        console.error('[SearchScreen] Error checking favorite:', error);
        // 개별 항목 오류는 무시하고 계속 진행
      }
    }
    setFavorites(favoritesSet);
  };

  // 결과가 변경될 때마다 즐겨찾기 상태 확인
  useEffect(() => {
    if (results.length > 0) {
      checkFavoritesStatus();
    }
  }, [results]);

  // 다운로드한 파일 목록 로드
  const loadDownloadedFiles = useCallback(async () => {
    try {
      const files = await getDownloadedFiles();
      // 최신순으로 정렬 (downloadedAt 기준, 타입과 무관하게 최신순)
      const sortedFiles = [...files].sort((a, b) => {
        // downloadedAt이 있으면 숫자 비교
        const timeA = a.downloadedAt || 0;
        const timeB = b.downloadedAt || 0;
        
        // 숫자 타입 확인 및 변환
        const numA = typeof timeA === 'number' ? timeA : (typeof timeA === 'string' ? parseFloat(timeA) : 0);
        const numB = typeof timeB === 'number' ? timeB : (typeof timeB === 'string' ? parseFloat(timeB) : 0);
        
        if (numA && numB) {
          // 둘 다 downloadedAt이 있으면 숫자 비교 (최신순: 큰 값이 먼저)
          const dateDiff = numB - numA;
          
          // 같은 downloadedAt이면 파일명으로 추가 비교 (안정 정렬 보장)
          if (dateDiff === 0) {
            const aStr = a.fileName || '';
            const bStr = b.fileName || '';
            return aStr.localeCompare(bStr);
          }
          
          return dateDiff;
        } else if (numA) {
          return -1; // a가 downloadedAt이 있으면 먼저
        } else if (numB) {
          return 1; // b가 downloadedAt이 있으면 먼저
        } else {
          // 둘 다 없으면 파일명으로 정렬 (최신순)
          const aName = a.fileName || '';
          const bName = b.fileName || '';
          return bName.localeCompare(aName);
        }
      });
      setDownloadedFiles(sortedFiles);
      console.log('[SearchScreen] Loaded downloaded files:', sortedFiles.length);
      
      // ✅ 썸네일 캐시 경로 로드
      const cachePaths = {};
      for (const file of sortedFiles) {
        if (file.videoId) {
          const cachePath = await getThumbnailCachePath(file.videoId);
          if (cachePath) {
            cachePaths[file.videoId] = cachePath;
          }
        }
      }
      setThumbnailCachePaths(cachePaths);
      console.log('[SearchScreen] Loaded thumbnail cache paths:', Object.keys(cachePaths).length);
    } catch (error) {
      console.error('[SearchScreen] Error loading downloaded files:', error);
    }
  }, []);

  // 화면 포커스 시 다운로드한 파일 목록 로드 (다운로드 상태는 유지)
  useFocusEffect(
    useCallback(() => {
      loadDownloadedFiles();
      // ✅ 다운로드 상태 초기화 제거 - 다른 탭으로 이동했다가 돌아와도 진행 상황 유지
      // 다른 앱으로 나갔다가 돌아올 때는 AppState의 'active' 이벤트에서만 초기화
    }, [loadDownloadedFiles])
  );
  
  // 앱 시작/컴포넌트 마운트 시 다운로드 상태 초기화 및 불완전한 파일 정리
  useEffect(() => {
    // 컴포넌트가 마운트될 때 다운로드 상태 초기화
    setDownloading({});
    
    // 앱 시작 시 불완전한 파일 정리 (한 번만 실행)
    cleanupIncompleteFiles().catch(error => {
      console.error('[SearchScreen] Error cleaning up incomplete files:', error);
    });
    
    // 앱이 백그라운드에서 포그라운드로 돌아올 때
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        console.log('[SearchScreen] App became active');
        
        // ✅ 파일 목록 새로고침 (UI 업데이트)
        // 스트리밍이므로 자동 이어받기 불가능, 파일 목록만 새로고침
        loadDownloadedFiles();
        
        // 앱이 활성화될 때 불완전한 파일 정리 (크기가 0인 파일만)
        cleanupIncompleteFiles().catch(error => {
          console.error('[SearchScreen] Error cleaning up incomplete files:', error);
        });
      }
    });
    
    return () => {
      subscription?.remove();
    };
  }, []); // ✅ results dependency 제거 (불필요)

  // 비디오 아이콘 펄스 애니메이션 (결과가 없을 때만)
  useEffect(() => {
    if (results.length === 0 && !loading) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [results.length, loading, pulseAnim]);

  // 영상 앱 열기
  const openVideoApp = useCallback(async () => {
    try {
      if (Platform.OS === 'ios') {
        // iOS: 앱 열기 시도
        const videoUrl = 'youtube://';
        const canOpen = await Linking.canOpenURL(videoUrl);
        if (canOpen) {
          await Linking.openURL(videoUrl);
        } else {
          // 앱이 없으면 웹 브라우저로 열기
          await Linking.openURL('https://www.youtube.com');
        }
      } else {
        // Android: Intent를 사용하여 앱 열기
        const intentUrl = 'intent://www.youtube.com/#Intent;scheme=https;package=com.google.android.youtube;end';
        try {
          await Linking.openURL(intentUrl);
        } catch (intentError) {
          // Intent 실패 시 일반 URL 시도
          const videoUrl = 'https://www.youtube.com';
          const canOpen = await Linking.canOpenURL(videoUrl);
          if (canOpen) {
            await Linking.openURL(videoUrl);
          } else {
            Alert.alert(t.error, t.cannotOpenVideo);
          }
        }
      }
    } catch (error) {
      console.error('[SearchScreen] Error opening video app:', error);
      // 실패 시 웹 브라우저로 열기
      try {
        await Linking.openURL('https://www.youtube.com');
      } catch (webError) {
        Alert.alert(t.error, t.cannotOpenVideo);
      }
    }
  }, []);

  // Deep Linking으로 받은 URL 처리 - 자동으로 링크 입력 및 가져오기 실행
  const processSharedUrl = useCallback((urlParam, timestamp, forceUpdate, forceReload) => {
    if (!urlParam) return;
    
    // URL에서 타임스탬프 제거 (oEmbed API 호출 시 문제 방지)
    let sharedUrl = urlParam.split('?t=')[0];
    
    // forceUpdate나 forceReload가 true이거나 타임스탬프가 다르면 무조건 업데이트
    // 타임스탬프가 있으면 항상 업데이트 (새로운 공유)
    const isNewShare = timestamp !== null && timestamp !== undefined;
    const shouldUpdate = forceUpdate || forceReload || isNewShare || lastProcessedUrl.current !== sharedUrl;
    
    if (!shouldUpdate) {
      console.log('[SearchScreen] Same URL, skipping:', sharedUrl, 'timestamp:', timestamp);
      return;
    }
    
    lastProcessedUrl.current = sharedUrl;
    console.log('[SearchScreen] 공유하기로 받은 URL:', sharedUrl, 'timestamp:', timestamp, 'forceUpdate:', forceUpdate, 'forceReload:', forceReload);
    
    // forceReload가 true이면 강제 리로드 (화면 새로고침)
    if (forceReload) {
      console.log('[SearchScreen] Force reload triggered');
      // 상태를 완전히 초기화
      setQuery('');
      setResults([]);
      setLoading(false);
      // 약간의 지연 후 새 URL 설정 (아래 로직 계속 실행)
    } else {
      // 이전 결과 즉시 초기화
      setResults([]);
      setLoading(false);
    }
    
    // URL 정리 (공백 제거 및 정규화)
    sharedUrl = sharedUrl.trim();
    
    // exp+app:// 스킴에서 실제 URL 추출
    if (sharedUrl.startsWith('exp+app://') || sharedUrl.startsWith('exp://')) {
      try {
        const urlObj = new URL(sharedUrl);
        const urlParam = urlObj.searchParams.get('url');
        if (urlParam) {
          sharedUrl = decodeURIComponent(urlParam);
          console.log('[SearchScreen] Extracted URL from exp+app://:', sharedUrl);
        }
      } catch (e) {
        console.warn('[SearchScreen] Failed to parse exp+app:// URL:', e);
        // exp+app://?url= 형식에서 직접 추출 시도
        const urlMatch = sharedUrl.match(/[?&]url=([^&]+)/);
        if (urlMatch) {
          sharedUrl = decodeURIComponent(urlMatch[1]);
          console.log('[SearchScreen] Extracted URL using regex:', sharedUrl);
        }
      }
    }
    
    // URL이 잘못된 형식인 경우 수정
    if (sharedUrl.startsWith(':om/') || sharedUrl.startsWith('om/') || sharedUrl.startsWith('be.com/')) {
      // 잘린 URL 복구 시도
      if (sharedUrl.startsWith('be.com/')) {
        sharedUrl = `https://www.youtu${sharedUrl}`;
      } else {
        sharedUrl = `https://www.youtub${sharedUrl}`;
      }
      console.log('[SearchScreen] 잘린 URL 복구:', sharedUrl);
    }
    
    // 정규화된 영상 URL로 변환
    const urlMatch = sharedUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s?]+)/);
    if (urlMatch) {
      const videoId = urlMatch[1].split('?')[0].split('&')[0]; // ?si= 같은 파라미터 제거
      sharedUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.log('[SearchScreen] 정규화된 URL:', sharedUrl);
    }
    
    // 입력창에 전체 URL 설정 (기존 URL 덮어쓰기)
    setQuery(sharedUrl);
    // 약간의 지연 후 자동으로 가져오기 실행 (상태 업데이트 대기)
    setTimeout(() => {
      console.log('[SearchScreen] 자동으로 가져오기 실행:', sharedUrl);
      handleSearchWithUrl(sharedUrl);
    }, 100); // 100ms 지연으로 단축
  }, [handleSearchWithUrl]);

  // navigation listener로 route params 변경 감지 (focus만 사용, state는 제거하여 중복 방지)
  useEffect(() => {
    const unsubscribeFocus = navigation.addListener('focus', () => {
      const urlParam = route?.params?.url;
      const timestamp = route?.params?.timestamp;
      const forceUpdate = route?.params?.forceUpdate;
      const forceReload = route?.params?.forceReload;
      
      console.log('[SearchScreen] Screen focused, params:', { urlParam, timestamp, forceUpdate, forceReload });
      
      if (urlParam) {
        // 약간의 지연 후 처리 (route params가 완전히 업데이트되도록)
        setTimeout(() => {
          processSharedUrl(urlParam, timestamp, forceUpdate, forceReload);
        }, 100);
      }
    });

    return () => {
      unsubscribeFocus();
    };
  }, [navigation, route?.params?.url, route?.params?.timestamp, route?.params?.forceUpdate, route?.params?.forceReload, processSharedUrl]);

  // route params 변경 감지 (초기 로드 및 params 변경 시) - 한 번만 실행
  useEffect(() => {
    const urlParam = route?.params?.url;
    const timestamp = route?.params?.timestamp;
    const forceUpdate = route?.params?.forceUpdate;
    const forceReload = route?.params?.forceReload;
    
    console.log('[SearchScreen] Route params changed:', { urlParam, timestamp, forceUpdate, forceReload });
    
    if (urlParam) {
      // 약간의 지연 후 처리 (중복 실행 방지)
      const timeoutId = setTimeout(() => {
        processSharedUrl(urlParam, timestamp, forceUpdate, forceReload);
      }, 50);
      
      return () => clearTimeout(timeoutId);
    }
  }, [route?.params?.url, route?.params?.timestamp, route?.params?.forceUpdate, route?.params?.forceReload, processSharedUrl]);

  // AppState 변경 감지 (앱이 포그라운드로 올 때 route params 다시 체크) - route params 변경 시에만 실행
  useEffect(() => {
    let appStateTimeout = null;
    
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        console.log('[SearchScreen] App became active, checking route params...');
        
        // 이전 timeout 취소
        if (appStateTimeout) {
          clearTimeout(appStateTimeout);
        }
        
        // 약간의 지연 후 처리 (앱이 완전히 활성화되도록)
        appStateTimeout = setTimeout(() => {
          const urlParam = route?.params?.url;
          const timestamp = route?.params?.timestamp;
          
          // route params에 URL이 있고, 아직 처리하지 않은 경우에만 실행
          if (urlParam && lastProcessedUrl.current !== urlParam.split('?t=')[0]) {
            console.log('[SearchScreen] Processing URL on app active:', urlParam, 'timestamp:', timestamp);
            processSharedUrl(urlParam, timestamp, true, false); // forceUpdate를 true로 설정
          }
        }, 300); // 300ms로 단축
      }
    });

    return () => {
      if (appStateTimeout) {
        clearTimeout(appStateTimeout);
      }
      appStateSubscription.remove();
    };
  }, [navigation, route?.params?.url, route?.params?.timestamp, processSharedUrl]);

  const handleSearchWithUrl = useCallback((url) => {
    if (!url || url.trim() === '') return;
    
    setLoading(true);
    setResults([]); // 이전 결과 초기화
    
    // URL 정리
    let cleanUrl = url.trim();
    
    // 잘린 URL 복구
    if (cleanUrl.startsWith(':om/') || cleanUrl.startsWith('om/')) {
      cleanUrl = `https://www.youtub${cleanUrl}`;
    }
    
    console.log('[SearchScreen] Searching for URL:', cleanUrl);
    
    // URL에서 비디오 ID 추출 (다양한 형식 지원)
    let videoId = null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s?]+)/,
      /youtube\.com\/watch\?.*v=([^&\s?]+)/,
      /youtu\.be\/([^&\s?]+)/,
    ];
    
    for (const pattern of patterns) {
      const match = cleanUrl.match(pattern);
      if (match) {
        videoId = match[1].split('?')[0].split('&')[0]; // ?si= 같은 파라미터 제거
        break;
      }
    }
    
    if (!videoId) {
      console.log('[SearchScreen] Invalid video URL:', cleanUrl);
      setLoading(false);
      return;
    }
    
    // 정규화된 URL 생성 (타임스탬프나 불필요한 파라미터 제거)
    const normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // ✅ URL을 route params에 저장하여 다른 메뉴에서 돌아와도 유지되도록 함
    navigation.setParams({ 
      url: normalizedUrl, 
      timestamp: null,
      forceUpdate: false,
      forceReload: false
    });
    
    // oEmbed API를 사용하여 비디오 정보 가져오기
    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(normalizedUrl)}&format=json`;
    
    fetch(oEmbedUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('[SearchScreen] oEmbed data:', data);
        const result = {
          id: videoId,
          title: data.title || `Video (${videoId})`,
          url: normalizedUrl,
          thumbnail: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          author: data.author_name || '',
          authorUrl: data.author_url || '',
          thumbnailWidth: data.thumbnail_width || 0,
          thumbnailHeight: data.thumbnail_height || 0,
        };
        setResults([result]);
        setLoading(false);
        console.log('[SearchScreen] Results set:', result);
      })
      .catch(error => {
        console.error('[SearchScreen] Error fetching video info:', error);
        // 에러 발생 시에도 기본 정보로 표시 (사용자가 볼 수 있도록)
        const fallbackResult = {
          id: videoId,
          title: `Video (${videoId})`,
          url: normalizedUrl,
          thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        };
        setResults([fallbackResult]);
        setLoading(false);
        // 에러는 로그만 남기고 사용자에게는 표시하지 않음 (기본 정보로 표시)
        
        // 즐겨찾기 상태 확인
        isFavorite(videoId).then(isFav => {
          if (isFav) {
            setFavorites(prev => new Set(prev).add(videoId));
          }
      }).catch(err => console.error('[SearchScreen] Error checking favorite:', err));
    });
  }, [navigation]);

  const handleSearch = () => {
    if (query.trim() === '') return;
    handleSearchWithUrl(query);
  };

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
        console.log('[SearchScreen] Favorite removed:', item.id);
      } else {
        // 즐겨찾기 추가
        await addFavorite({
          id: item.id,
          title: item.title,
          url: item.url,
          thumbnail: item.thumbnail,
          author: item.author,
          authorUrl: item.authorUrl,
        });
        setFavorites(prev => new Set(prev).add(item.id));
        console.log('[SearchScreen] Favorite added:', item.id);
      }
    } catch (error) {
      console.error('[SearchScreen] Error toggling favorite:', error);
      Alert.alert(t.error, t.favoriteSaveError);
    }
  };

  const handleDownloadVideo = async (item, existingFile = null) => {
    if (!item.url || !item.id) {
      Alert.alert(t.error, t.noVideoInfo);
      return;
    }

    // 이미 저장 중인 경우 취소 확인
    if (downloading[item.id]) {
      Alert.alert(
        t.saving || '저장 중',
        t.savingInProgress || '이미 저장이 진행 중입니다. 취소하시겠습니까?',
        [
          { text: t.no, style: 'cancel' },
          {
            text: t.cancel,
            style: 'destructive',
            onPress: () => {
              // 다운로드 상태 초기화 (실제 취소는 서비스 레벨에서 처리 어려움)
              setDownloading(prev => {
                const newState = { ...prev };
                delete newState[item.id];
                return newState;
              });
            }
          }
        ]
      );
      return;
    }

    // 스트리밍이므로 이어받기 불가능, 항상 처음부터 다운로드
    const shouldResume = false;

    try {
      setDownloading(prev => ({ ...prev, [item.id]: { type: 'video', progress: 0 } }));
      
      // 새로 다운로드 (영상받기 또는 다시받기)
      showDownloadAlert(!!existingFile, true);
      const downloadResult = await downloadVideo(
          item.url,
          item.title,
          (progress, expectedSize) => {
            // 다운로드 중인지 확인 (취소되었을 수 있음)
            setDownloading(prev => {
              if (!prev[item.id]) {
                return prev;
              }
              return {
                ...prev,
                [item.id]: {
                  type: 'video',
                  progress,
                  expectedSize: expectedSize != null ? expectedSize : prev[item.id]?.expectedSize
                }
              };
            });
          },
          0, // retryCount
          item.id, // videoId
          item.thumbnail, // thumbnailUrl
          false // shouldResume (기존 파일 삭제 후 새로 다운로드)
        );
      
      const fileUri = downloadResult.uri;
      const fileName = downloadResult.fileName;
      
      // 다운로드가 완료되었는지 확인 (취소되지 않았는지)
      setDownloading(prev => {
        if (!prev[item.id]) {
          // 이미 취소되었으면 상태 업데이트하지 않음
          return prev;
        }
        const newState = { ...prev };
        delete newState[item.id];
        return newState;
      });
      
      // 다운로드한 파일 목록 새로고침
      loadDownloadedFiles();
      
      // 파일 정보 확인
      const fileInfo = await getFileInfo(fileUri);
      const fileSizeText = fileInfo?.size ? `(${(fileInfo.size / (1024 * 1024)).toFixed(2)} MB)` : '';
      
      Alert.alert(
        t.saveComplete,
        `${t.videoSaveComplete} ${fileSizeText}`,
        [
          { text: t.cancel, style: 'cancel' },
          {
            text: t.saveButton,
            onPress: async () => {
              try {
                await saveFileToDevice(fileUri, fileName, true, item.id);
                Alert.alert(t.notice, t.videoSavedToGallery);
              } catch (error) {
                console.error('[SearchScreen] Error saving file:', error);
                Alert.alert(t.error, error.message || t.saveFileError);
              }
            }
          },
          {
            text: t.shareButton,
            onPress: () => shareDownloadedFile(fileUri, fileName, true, item.id)
          }
        ]
      );
    } catch (error) {
      console.error('[SearchScreen] Error downloading video:', error);
      // 에러 발생 시 무조건 상태 초기화
      setDownloading(prev => {
        const newState = { ...prev };
        delete newState[item.id];
        return newState;
      });
      Alert.alert(t.error, error.message || t.videoSaveError);
    } finally {
      // finally 블록에서 상태 초기화 보장 (에러가 발생해도 실행)
      // 이미 catch에서 처리했지만 이중 보장
      setDownloading(prev => {
        const newState = { ...prev };
        delete newState[item.id];
        return newState;
      });
    }

    // 아래 코드는 백엔드 서버가 준비되면 활성화
    /*
    try {
      setDownloading(prev => ({ ...prev, [item.id]: { type: 'video', progress: 0 } }));
      
      Alert.alert(t.notice, t.videoSaveStarted);
      
      const fileUri = await downloadVideo(
        item.url,
        item.title,
        (progress) => {
          setDownloading(prev => ({
            ...prev,
            [item.id]: { type: 'video', progress }
          }));
        }
      );
      
      setDownloading(prev => {
        const newState = { ...prev };
        delete newState[item.id];
        return newState;
      });
      
      Alert.alert(
        t.saveComplete,
        t.videoSaveComplete,
        [
          { text: t.cancel, style: 'cancel' },
          {
            text: t.shareButton,
            onPress: () => shareDownloadedFile(fileUri, `${sanitizeFileName(item.title)}.mp4`, true)
          }
        ]
      );
    } catch (error) {
      console.error('[SearchScreen] Error downloading video:', error);
      setDownloading(prev => {
        const newState = { ...prev };
        delete newState[item.id];
        return newState;
      });
      Alert.alert(t.error, error.message || t.videoSaveError);
    }
    */
  };

  const handleDownloadAudio = async (item, existingFile = null) => {
    if (!item.url || !item.id) {
      Alert.alert(t.error, t.noMusicInfo);
      return;
    }

    // 이미 저장 중인 경우 취소 확인
    if (downloading[item.id]) {
      Alert.alert(
        t.saving || '저장 중',
        t.savingInProgress || '이미 저장이 진행 중입니다. 취소하시겠습니까?',
        [
          { text: t.no, style: 'cancel' },
          {
            text: t.cancel,
            style: 'destructive',
            onPress: () => {
              // 다운로드 상태 초기화 (실제 취소는 서비스 레벨에서 처리 어려움)
              setDownloading(prev => {
                const newState = { ...prev };
                delete newState[item.id];
                return newState;
              });
            }
          }
        ]
      );
      return;
    }

    // 스트리밍이므로 이어받기 불가능, 항상 처음부터 다운로드
    const shouldResume = false;

    try {
      setDownloading(prev => ({ ...prev, [item.id]: { type: 'audio', progress: 0 } }));
      
      // 새로 다운로드 (음악받기 또는 다시받기)
      showDownloadAlert(!!existingFile, false);
      const downloadResult = await downloadAudio(
          item.url,
          item.title,
          (progress, expectedSize) => {
            // 다운로드 중인지 확인 (취소되었을 수 있음)
            setDownloading(prev => {
              if (!prev[item.id]) {
                return prev;
              }
              return {
                ...prev,
                [item.id]: {
                  type: 'audio',
                  progress,
                  expectedSize: expectedSize != null ? expectedSize : prev[item.id]?.expectedSize
                }
              };
            });
          },
          0, // retryCount
          item.id, // videoId
          item.thumbnail, // thumbnailUrl
          false // shouldResume (기존 파일 삭제 후 새로 다운로드)
        );
      
      const fileUri = downloadResult.uri;
      const fileName = downloadResult.fileName;
      
      // 다운로드가 완료되었는지 확인 (취소되지 않았는지)
      setDownloading(prev => {
        if (!prev[item.id]) {
          // 이미 취소되었으면 상태 업데이트하지 않음
          return prev;
        }
        const newState = { ...prev };
        delete newState[item.id];
        return newState;
      });
      
      // 다운로드한 파일 목록 새로고침
      loadDownloadedFiles();
      
      // 파일 정보 확인
      const fileInfo = await getFileInfo(fileUri);
      const fileSizeText = fileInfo?.size ? `(${(fileInfo.size / (1024 * 1024)).toFixed(2)} MB)` : '';
      
      Alert.alert(
        t.saveComplete,
        `${t.musicSaveComplete} ${fileSizeText}`,
        [
          { text: t.cancel, style: 'cancel' },
          {
            text: t.saveButton,
            onPress: async () => {
              try {
                await saveFileToDevice(fileUri, fileName, false, item.id);
                Alert.alert(t.notice, t.musicSavedToApp);
              } catch (error) {
                console.error('[SearchScreen] Error saving file:', error);
                Alert.alert(t.error, error.message || t.saveFileError);
              }
            }
          },
          {
            text: t.shareButton,
            onPress: () => shareDownloadedFile(fileUri, fileName, false, item.id)
          }
        ]
      );
    } catch (error) {
      console.error('[SearchScreen] Error downloading audio:', error);
      // 에러 발생 시 무조건 상태 초기화
      setDownloading(prev => {
        const newState = { ...prev };
        delete newState[item.id];
        return newState;
      });
      Alert.alert(t.error, error.message || t.musicSaveError);
    } finally {
      // finally 블록에서 상태 초기화 보장 (에러가 발생해도 실행)
      // 이미 catch에서 처리했지만 이중 보장
      setDownloading(prev => {
        const newState = { ...prev };
        delete newState[item.id];
        return newState;
      });
    }

    // 아래 코드는 백엔드 서버가 준비되면 활성화
    /*
    try {
      setDownloading(prev => ({ ...prev, [item.id]: { type: 'audio', progress: 0 } }));
      
      Alert.alert(t.notice, t.musicSaveStarted);
      
      const fileUri = await downloadAudio(
        item.url,
        item.title,
        (progress) => {
          setDownloading(prev => ({
            ...prev,
            [item.id]: { type: 'audio', progress }
          }));
        }
      );
      
      setDownloading(prev => {
        const newState = { ...prev };
        delete newState[item.id];
        return newState;
      });
      
      Alert.alert(
        t.saveComplete,
        t.musicSaveComplete,
        [
          { text: t.cancel, style: 'cancel' },
          {
            text: t.shareButton,
            onPress: () => shareDownloadedFile(fileUri, `${sanitizeFileName(item.title)}.mp4`, true)
          }
        ]
      );
    } catch (error) {
      console.error('[SearchScreen] Error downloading audio:', error);
      setDownloading(prev => {
        const newState = { ...prev };
        delete newState[item.id];
        return newState;
      });
      Alert.alert(t.error, error.message || t.musicSaveError);
    }
    */
  };

  const handleOpenVideo = async (item) => {
    if (!item.url) {
      Alert.alert(t.error, t.videoUrlNotFound);
      return;
    }

    try {
      const videoUrl = item.url;
      console.log('[SearchScreen] Opening video URL:', videoUrl);
      
      // 앱으로 열기 시도
      const canOpen = await Linking.canOpenURL(videoUrl);
      if (canOpen) {
        await Linking.openURL(videoUrl);
      } else {
        Alert.alert(t.error, t.cannotOpenVideo);
      }
    } catch (error) {
      console.error('[SearchScreen] Error opening video:', error);
      Alert.alert(t.error, t.cannotOpenVideo);
    }
  };

  // 다운로드한 파일 재생 (외부 플레이어로 열기)
  const handlePlayFile = async (file) => {
    try {
      if (Platform.OS === 'android') {
        let contentUri = null;
        
        // videoId가 있으면 외부 저장소에서 파일 찾기 시도
        if (file.videoId && MediaStoreModule && typeof MediaStoreModule.getContentUriByVideoId === 'function') {
          try {
            contentUri = await MediaStoreModule.getContentUriByVideoId(file.videoId, file.isVideo);
            console.log('[SearchScreen] ✅ Found file in external storage, using it for playback:', contentUri);
          } catch (error) {
            console.warn('[SearchScreen] ⚠️ Could not find file in external storage by videoId, falling back to internal file:', error.message);
            // 외부 저장소에서 찾지 못하면 내부 저장소 파일 사용
          }
        }
        
        // 외부 저장소에서 찾지 못했으면 내부 저장소 파일 사용
        if (!contentUri) {
          // ✅ 공유하기/저장하기와 동일한 방식으로 파일 찾기 (여러 경로 시도)
          let fileUri = file.fileUri;
          const fileName = file.fileName;
          const DOWNLOAD_DIR = `${FileSystem.documentDirectory}downloads/`;
          
          console.log('[SearchScreen] Playing file:', fileUri, fileName);
          let fileInfo = await FileSystem.getInfoAsync(fileUri);
          
          if (!fileInfo.exists) {
            // 1. URL 디코딩 시도
            try {
              const decodedUri = decodeURIComponent(fileUri);
              if (decodedUri !== fileUri) {
                console.log('[SearchScreen] Trying decoded URI:', decodedUri);
                fileInfo = await FileSystem.getInfoAsync(decodedUri);
                if (fileInfo.exists) {
                  fileUri = decodedUri;
                  console.log('[SearchScreen] ✅ File found with decoded URI');
                }
              }
            } catch (e) {
              console.warn('[SearchScreen] Could not decode URI:', e);
            }
            
            // 2. file:// 프로토콜 제거 후 시도
            if (!fileInfo.exists && fileUri.startsWith('file://')) {
              const withoutProtocol = fileUri.replace('file://', '');
              console.log('[SearchScreen] Trying URI without file:// protocol:', withoutProtocol);
              fileInfo = await FileSystem.getInfoAsync(withoutProtocol);
              if (fileInfo.exists) {
                fileUri = withoutProtocol;
                console.log('[SearchScreen] ✅ File found without file:// protocol');
              }
            }
            
            // 3. file:// 프로토콜 추가 후 시도
            if (!fileInfo.exists && !fileUri.startsWith('file://')) {
              const withProtocol = `file://${fileUri}`;
              console.log('[SearchScreen] Trying URI with file:// protocol:', withProtocol);
              fileInfo = await FileSystem.getInfoAsync(withProtocol);
              if (fileInfo.exists) {
                fileUri = withProtocol;
                console.log('[SearchScreen] ✅ File found with file:// protocol');
              }
            }
            
            // 4. 파일명으로 경로 재구성 시도 (DOWNLOAD_DIR 사용)
            if (!fileInfo.exists && fileName) {
              const reconstructedUri = `${DOWNLOAD_DIR}${fileName}`;
              if (reconstructedUri !== fileUri && !reconstructedUri.includes(fileUri) && !fileUri.includes(reconstructedUri)) {
                console.log('[SearchScreen] Trying reconstructed URI from fileName:', reconstructedUri);
                fileInfo = await FileSystem.getInfoAsync(reconstructedUri);
                if (fileInfo.exists) {
                  fileUri = reconstructedUri;
                  console.log('[SearchScreen] ✅ File found with reconstructed URI');
                }
              }
            }
            
            // 5. URI에서 파일명 추출하여 재구성 시도
            if (!fileInfo.exists && fileUri.includes('/')) {
              const uriParts = fileUri.split('/');
              const uriFileName = uriParts[uriParts.length - 1];
              if (uriFileName && uriFileName.includes('.') && uriFileName !== fileName) {
                let decodedFileName = uriFileName;
                try {
                  decodedFileName = decodeURIComponent(uriFileName);
                } catch (e) {
                  // 디코딩 실패해도 원본 사용
                }
                
                const altUri = `${DOWNLOAD_DIR}${decodedFileName}`;
                if (altUri !== fileUri && altUri !== `${DOWNLOAD_DIR}${fileName}`) {
                  console.log('[SearchScreen] Trying alternative URI from path:', altUri);
                  fileInfo = await FileSystem.getInfoAsync(altUri);
                  if (fileInfo.exists) {
                    fileUri = altUri;
                    console.log('[SearchScreen] ✅ File found with alternative URI from path');
                  }
                }
              }
            }
            
            // 6. file:// 프로토콜을 제거한 상태로 재구성 시도
            if (!fileInfo.exists && fileName) {
              let cleanUri = fileUri;
              if (cleanUri.startsWith('file://')) {
                cleanUri = cleanUri.replace('file://', '');
              }
              const cleanReconstructedUri = `${DOWNLOAD_DIR}${fileName}`;
              
              if (cleanReconstructedUri !== cleanUri) {
                console.log('[SearchScreen] Trying clean reconstructed URI:', cleanReconstructedUri);
                fileInfo = await FileSystem.getInfoAsync(cleanReconstructedUri);
                if (fileInfo.exists) {
                  fileUri = cleanReconstructedUri;
                  console.log('[SearchScreen] ✅ File found with clean reconstructed URI');
                }
              }
            }
          }
          
          if (!fileInfo.exists) {
            console.error('[SearchScreen] ❌ File does not exist after all attempts!');
            Alert.alert(t.error, t.fileNotFound);
            return;
          }

          // FileProvider를 사용하여 content:// URI 생성
          if (MediaStoreModule && typeof MediaStoreModule.getContentUri === 'function') {
            // file:// 프로토콜 제거 (네이티브 모듈은 절대 경로를 원함)
            let normalizedFileUri = fileInfo.uri || fileUri;
            if (normalizedFileUri.startsWith('file://')) {
              normalizedFileUri = normalizedFileUri.replace('file://', '');
            }
            
            contentUri = await MediaStoreModule.getContentUri(normalizedFileUri);
          } else {
            Alert.alert(t.error, t.playFileError);
            return;
          }
        }

        if (!contentUri) {
          Alert.alert(t.error, t.playFileError);
          return;
        }

        // MIME 타입 결정
        let mimeType = file.isVideo ? 'video/*' : 'audio/*';
        
        // 파일 확장자에 따라 더 구체적인 MIME 타입 설정
        const extension = file.fileName.split('.').pop()?.toLowerCase();
        if (extension === 'mp4') {
          mimeType = 'video/mp4';
        } else if (extension === 'm4a') {
          mimeType = 'audio/mp4';
        } else if (extension === 'mp3') {
          mimeType = 'audio/mpeg';
        }
        
        // Intent를 사용하여 외부 플레이어로 파일 열기
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          type: mimeType,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        });
      } else {
        Alert.alert(t.notice, t.iosNotSupported);
      }
    } catch (error) {
      console.error('[SearchScreen] Error playing file:', error);
      console.error('[SearchScreen] Error details:', JSON.stringify(error, null, 2));
      Alert.alert(t.error, t.cannotPlayFile.replace('{error}', error.message || t.unknownError));
    }
  };

  // 다운로드한 파일 재저장
  const handleResaveFile = async (file) => {
    try {
      // ✅ 파일이 실제로 존재하는지 먼저 확인
      const fileInfo = await FileSystem.getInfoAsync(file.fileUri);
      
      if (!fileInfo.exists || !fileInfo.size || fileInfo.size === 0) {
        // 파일이 존재하지 않으면 여러 경로 시도
        let found = false;
        let foundUri = file.fileUri;
        
        // 1. file:// 프로토콜 제거/추가 시도
        if (file.fileUri.startsWith('file://')) {
          const withoutProtocol = file.fileUri.replace('file://', '');
          const altInfo = await FileSystem.getInfoAsync(withoutProtocol);
          if (altInfo.exists && altInfo.size > 0) {
            found = true;
            foundUri = withoutProtocol;
          }
        } else {
          const withProtocol = `file://${file.fileUri}`;
          const altInfo = await FileSystem.getInfoAsync(withProtocol);
          if (altInfo.exists && altInfo.size > 0) {
            found = true;
            foundUri = withProtocol;
          }
        }
        
        // 2. 파일명으로 경로 재구성 시도
        if (!found && file.fileName) {
          const reconstructedUri = `${FileSystem.documentDirectory}downloads/${file.fileName}`;
          const reconInfo = await FileSystem.getInfoAsync(reconstructedUri);
          if (reconInfo.exists && reconInfo.size > 0) {
            found = true;
            foundUri = reconstructedUri;
          }
        }
        
        if (!found) {
          Alert.alert(
            t.fileNotFoundTitle,
            t.fileNotFoundOrDamaged,
            [{ text: t.ok }]
          );
          return;
        }
        
        // 찾은 URI로 업데이트
        file.fileUri = foundUri;
      }
      
      await saveFileToDevice(file.fileUri, file.fileName, file.isVideo, file.videoId ?? null);
      Alert.alert(
        t.notice,
        file.isVideo 
          ? t.videoSavedToGallery
          : t.musicSavedToApp
      );
      // 저장 후 파일 목록 새로고침
      loadDownloadedFiles();
    } catch (error) {
      console.error('[SearchScreen] Error resaving file:', error);
      Alert.alert(t.error, error.message || t.saveFileError);
    }
  };

  // 다운로드한 파일 항목 렌더링
  const renderDownloadedFileItem = ({ item, index }) => {
    const fileSizeMB = (item.size / (1024 * 1024)).toFixed(2);
    
    // ✅ 썸네일 표시: 온라인에서는 영상 URL 우선, 실패 시 캐시 사용
    const cachePath = item.videoId ? thumbnailCachePaths[item.videoId] : null;
    const cacheUri = cachePath ? `file://${cachePath}` : null;
    // getDownloadedFiles는 thumbnail 필드를 반환하지만, DownloadsScreen과의 일관성을 위해 thumbnailUrl로도 확인
    const thumbnailUrl = item.thumbnailUrl || item.thumbnail || null;
    
    // ✅ 카드 클릭 핸들러
    const handleDownloadedFileItemPress = () => {
      if (!item.videoId) {
        Alert.alert(t.notice, t.noVideoUrl);
        return;
      }

      try {
        const videoUrl = `https://www.youtube.com/watch?v=${item.videoId}`;
        console.log('[SearchScreen] Setting URL from downloaded file:', videoUrl);
        
        // 같은 화면이므로 processSharedUrl을 호출하여 URL 설정
        processSharedUrl(videoUrl, Date.now(), true, true);
      } catch (error) {
        console.error('[SearchScreen] Error setting URL from downloaded file:', error);
        Alert.alert(t.error, t.cannotNavigateToSearch);
      }
    };
    
    return (
      <TouchableOpacity 
        style={[styles.downloadedFileItem, index === 0 && styles.downloadedFileItemFirst]}
        onPress={handleDownloadedFileItemPress}
        activeOpacity={0.8}
      >
        <View style={styles.downloadedFileInfo}>
          <View style={styles.downloadedFileThumbnailContainer}>
            {(thumbnailUrl || cacheUri) ? (
              <ThumbnailImage
                sourceUri={thumbnailUrl}
                cacheUri={cacheUri}
                style={styles.downloadedFileThumbnail}
              />
            ) : (
              <View style={[styles.downloadedFileThumbnail, styles.downloadedFileThumbnailPlaceholder]}>
                <Ionicons 
                  name={item.isVideo ? "videocam" : "musical-notes"} 
                  size={24} 
                  color={item.isVideo ? "#FF0000" : "#4CAF50"} 
                />
              </View>
            )}
            {/* ✅ 썸네일 위에 아이콘 오버레이 */}
            {(thumbnailUrl || cacheUri) && (
              <View style={styles.downloadedFileThumbnailIcon}>
                <Ionicons 
                  name={item.isVideo ? "videocam" : "musical-notes"} 
                  size={14} 
                  color={item.isVideo ? "#FF0000" : "#4CAF50"} 
                />
              </View>
            )}
          </View>
          <View style={styles.downloadedFileDetails}>
            <Text style={styles.downloadedFileName} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.downloadedFileSize}>
              {fileSizeMB} MB • {item.isVideo ? t.video : t.music}
            </Text>
          </View>
        </View>
        <View style={styles.downloadedFileActions}>
          <TouchableOpacity
            style={styles.downloadedFileActionButton}
            onPress={(e) => {
              e.stopPropagation(); // 카드 클릭 이벤트 전파 방지
              handlePlayFile(item);
            }}
          >
            <Ionicons name="play" size={20} color={item.isVideo ? "#FF0000" : "#4CAF50"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.downloadedFileActionButton}
            onPress={(e) => {
              e.stopPropagation(); // 카드 클릭 이벤트 전파 방지
              shareDownloadedFile(item.fileUri, item.fileName, item.isVideo, item.videoId);
            }}
          >
            <Ionicons name="share" size={20} color="#2196F3" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.downloadedFileActionButton}
            onPress={(e) => {
              e.stopPropagation(); // 카드 클릭 이벤트 전파 방지
              handleResaveFile(item);
            }}
          >
            <Ionicons name="save" size={20} color="#FF9800" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // 검색 결과 항목 제거
  const handleRemoveResult = (item) => {
    setResults(prevResults => prevResults.filter(result => result.id !== item.id));
  };

  const renderVideoItem = ({ item, index }) => {
    const isDownloadingVideo = downloading[item.id]?.type === 'video';
    const isDownloadingAudio = downloading[item.id]?.type === 'audio';
    const downloadProgress = downloading[item.id]?.progress || 0;
    const expectedSizeBytes = downloading[item.id]?.expectedSize;
    const expectedSizeText = expectedSizeBytes != null && expectedSizeBytes > 0
      ? (expectedSizeBytes >= 1024 * 1024 ? (expectedSizeBytes / (1024 * 1024)).toFixed(1) + ' MB' : (expectedSizeBytes / 1024).toFixed(0) + ' KB')
      : null;
    const isDownloading = isDownloadingVideo || isDownloadingAudio;
    
    // ✅ 해당 영상의 다운로드된 파일 찾기 (videoId 우선, 없으면 제목 기반 매칭)
    const findDownloadedFile = (isVideo) => {
      // videoId로 먼저 찾기
      if (item.id) {
        const foundById = downloadedFiles.find(file => 
          file.videoId === item.id && file.isVideo === isVideo
        );
        if (foundById) return foundById;
      }
      
      // videoId로 못 찾으면 제목 기반 매칭
      if (!item.title) return null;
      
      const sanitizedTitle = sanitizeFileName(item.title || (isVideo ? 'video' : 'audio'), 195);
      
      return downloadedFiles.find(file => {
        const fileBaseName = file.fileName.replace(/\.[^.]+$/, '');
        const normalizedFileTitle = fileBaseName.replace(/_/g, ' ');
        const normalizedItemTitle = sanitizedTitle.replace(/_/g, ' ');
        
        return normalizedFileTitle === normalizedItemTitle && file.isVideo === isVideo;
      });
    };
    
    const downloadedVideo = findDownloadedFile(true);
    const downloadedAudio = findDownloadedFile(false);
    const hasDownloadedFiles = downloadedVideo || downloadedAudio;
    
    // 버튼 표시 로직: 스트리밍이므로 이어받기 불가능, 항상 '다시받기'
    const getVideoButtonText = () => {
      if (isDownloadingVideo) return t.saving || '저장 중...';
      if (!downloadedVideo) return t.saveVideo; // '영상받기'
      // 스트리밍이므로 이어받기 불가능, status와 무관하게 '다시받기'
      return t.redownload; // '다시받기'
    };
    
    const getAudioButtonText = () => {
      if (isDownloadingAudio) return t.saving || '저장 중...';
      if (!downloadedAudio) return t.saveMusic; // '음악받기'
      // 스트리밍이므로 이어받기 불가능, status와 무관하게 '다시받기'
      return t.redownload; // '다시받기'
    };
    
    return (
      <TouchableOpacity 
        style={styles.videoItem}
        onPress={() => {
          // ✅ 다운로드 중일 때는 영상 이동 비활성화
          if (!isDownloading) {
            handleOpenVideo(item);
          }
        }}
        activeOpacity={isDownloading ? 1 : 0.8}
        disabled={isDownloading}
      >
        {item.thumbnail && (
          <Image 
            source={{ uri: item.thumbnail }} 
            style={[
              styles.videoThumbnail,
              isDownloading && styles.videoThumbnailDisabled
            ]}
            resizeMode="cover"
          />
        )}
        <View style={styles.videoContent}>
          <TouchableOpacity
            style={styles.removeResultButton}
            onPress={(e) => {
              e.stopPropagation();
              handleRemoveResult(item);
            }}
          >
            <Ionicons name="close-circle" size={24} color="#999" />
          </TouchableOpacity>
          <Text style={styles.videoTitle} numberOfLines={2}>
            {item.title || 'Video'}
          </Text>
          
          {/* ✅ 다운로드된 파일이 있을 때: 재생, 공유, 재저장, 삭제 버튼 표시 */}
          {!isDownloading && hasDownloadedFiles && (
            <View style={styles.downloadedActionsContainer}>
              {/* ✅ 영상 행 */}
              {downloadedVideo && (
                <View style={styles.downloadedActionsRowContainer}>
                  <View style={styles.downloadedActionsRowLabel}>
                    <Ionicons name="videocam" size={16} color="#FF0000" />
                    <Text style={styles.downloadedActionsRowLabelText}>{t.video}</Text>
                  </View>
                  <View style={styles.downloadedActionsRow}>
                    <TouchableOpacity
                      style={styles.downloadedActionButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        handlePlayFile(downloadedVideo);
                      }}
                    >
                      <Ionicons name="play" size={18} color="#FF0000" />
                      <Text style={[styles.downloadedActionText, { color: '#FF0000' }]}>{t.play}</Text>
                    </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.downloadedActionButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      shareDownloadedFile(downloadedVideo.fileUri, downloadedVideo.fileName, true, downloadedVideo.videoId);
                    }}
                  >
                    <Ionicons name="share" size={18} color="#2196F3" />
                    <Text style={[styles.downloadedActionText, { color: '#2196F3' }]}>{t.share}</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.downloadedActionButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleResaveFile(downloadedVideo);
                    }}
                  >
                    <Ionicons name="save" size={18} color="#FF9800" />
                    <Text style={[styles.downloadedActionText, { color: '#FF9800' }]}>{t.resave}</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.downloadedActionButton, styles.deleteActionButton]}
                    onPress={(e) => {
                      e.stopPropagation();
                      Alert.alert(
                        t.deleteFileTitle,
                        t.deleteVideoFileMessage.replace('{name}', downloadedVideo.title),
                        [
                          { text: t.cancel, style: 'cancel' },
                          {
                            text: t.delete,
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                await FileSystem.deleteAsync(downloadedVideo.fileUri, { idempotent: true });
                                // ✅ 메타데이터 정리 및 썸네일 캐시 스마트 삭제
                                await deleteFileWithMetadata(downloadedVideo.fileName, downloadedVideo.videoId);
                                loadDownloadedFiles();
                                Alert.alert(t.complete, t.videoFileDeleted);
                              } catch (error) {
                                Alert.alert(t.error, t.deleteFileError);
                              }
                            }
                          }
                        ]
                      );
                    }}
                  >
                    <Ionicons name="trash" size={18} color="#f44336" />
                    <Text style={[styles.downloadedActionText, styles.deleteActionText]}>{t.delete}</Text>
                  </TouchableOpacity>
                  </View>
                </View>
              )}
              
              {/* ✅ 음악 행 */}
              {downloadedAudio && (
                <View style={styles.downloadedActionsRowContainer}>
                  <View style={styles.downloadedActionsRowLabel}>
                    <Ionicons name="musical-notes" size={16} color="#4CAF50" />
                    <Text style={[styles.downloadedActionsRowLabelText, { color: '#4CAF50' }]}>{t.music}</Text>
                  </View>
                  <View style={styles.downloadedActionsRow}>
                    <TouchableOpacity
                      style={styles.downloadedActionButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        handlePlayFile(downloadedAudio);
                      }}
                    >
                      <Ionicons name="play" size={18} color="#4CAF50" />
                      <Text style={[styles.downloadedActionText, { color: '#4CAF50' }]}>{t.play}</Text>
                    </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.downloadedActionButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      shareDownloadedFile(downloadedAudio.fileUri, downloadedAudio.fileName, false, downloadedAudio.videoId);
                    }}
                  >
                    <Ionicons name="share" size={18} color="#2196F3" />
                    <Text style={[styles.downloadedActionText, { color: '#2196F3' }]}>{t.share}</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.downloadedActionButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleResaveFile(downloadedAudio);
                    }}
                  >
                    <Ionicons name="save" size={18} color="#FF9800" />
                    <Text style={[styles.downloadedActionText, { color: '#FF9800' }]}>{t.resave}</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.downloadedActionButton, styles.deleteActionButton]}
                    onPress={(e) => {
                      e.stopPropagation();
                      Alert.alert(
                        t.deleteFileTitle,
                        t.deleteMusicFileMessage.replace('{name}', downloadedAudio.title),
                        [
                          { text: t.cancel, style: 'cancel' },
                          {
                            text: t.delete,
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                await FileSystem.deleteAsync(downloadedAudio.fileUri, { idempotent: true });
                                // ✅ 메타데이터 정리 및 썸네일 캐시 스마트 삭제
                                await deleteFileWithMetadata(downloadedAudio.fileName, downloadedAudio.videoId);
                                loadDownloadedFiles();
                                Alert.alert(t.complete, t.musicFileDeleted);
                              } catch (error) {
                                Alert.alert(t.error, t.deleteFileError);
                              }
                            }
                          }
                        ]
                      );
                    }}
                  >
                    <Ionicons name="trash" size={18} color="#f44336" />
                    <Text style={[styles.downloadedActionText, styles.deleteActionText]}>{t.delete}</Text>
                  </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
          
          {/* ✅ 다운로드 중일 때: 예상 크기 + 진행률 표시 + 프로그레스 바 */}
          {isDownloading && (
            <View style={styles.downloadingContainer}>
              {expectedSizeText && (
                <Text style={styles.downloadingExpectedSize}>
                  {t.expectedSize}: {expectedSizeText}
                </Text>
              )}
              {isDownloadingVideo && (
                <View style={styles.downloadingItem}>
                  <ActivityIndicator size="small" color="#FF0000" />
                  <View style={styles.downloadingProgressWrap}>
                    <Text style={styles.downloadingText}>
                      {t.videoDownloading} {Math.round(downloadProgress * 100)}%
                    </Text>
                    <View style={styles.downloadingProgressBar}>
                      <View style={[styles.downloadingProgressBarFill, { width: `${Math.min(100, Math.round(downloadProgress * 100))}%` }]} />
                    </View>
                  </View>
                </View>
              )}
              {isDownloadingAudio && (
                <View style={styles.downloadingItem}>
                  <ActivityIndicator size="small" color="#4CAF50" />
                  <View style={styles.downloadingProgressWrap}>
                    <Text style={styles.downloadingText}>
                      {t.musicDownloading} {Math.round(downloadProgress * 100)}%
                    </Text>
                    <View style={styles.downloadingProgressBar}>
                      <View style={[styles.downloadingProgressBarFill, { width: `${Math.min(100, Math.round(downloadProgress * 100))}%`, backgroundColor: '#4CAF50' }]} />
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}
          
          {/* ✅ 다운로드 버튼 컨테이너 - 항상 표시 (다운로드 중이 아닐 때) */}
          {!isDownloading && (
            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={styles.favoriteButton}
                onPress={(e) => {
                  e.stopPropagation();
                  handleAddFavorite(item);
                }}
              >
                <Ionicons 
                  name={favorites.has(item.id) ? "star" : "star-outline"} 
                  size={20} 
                  color={favorites.has(item.id) ? "#FFD700" : "#999"} 
                />
                <Text style={styles.buttonText}>{t.addToFavorites}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.videoButton}
                onPress={(e) => {
                  e.stopPropagation();
                  handleDownloadVideo(item, downloadedVideo);
                }}
              >
                <Ionicons name="videocam" size={20} color="#fff" />
                <Text style={styles.videoButtonText}>
                  {getVideoButtonText()}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.audioButton}
                onPress={(e) => {
                  e.stopPropagation();
                  handleDownloadAudio(item, downloadedAudio);
                }}
              >
                <Ionicons name="musical-notes" size={20} color="#fff" />
                <Text style={styles.audioButtonText}>
                  {getAudioButtonText()}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#FF0000" />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        {/* 상단 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.logoContainer}
            onPress={() => {
              // 음악 찾기 화면으로 이동
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
            <Text style={styles.headerTitle}>{t.appTitle}</Text>
          </View>
          <LanguageSelector />
        </View>
      </SafeAreaView>

      <View style={styles.searchSection}>
        <View style={styles.inputContainer}>
          <Ionicons name="link" size={20} color="#999" style={styles.linkIcon} />
          <TextInput
            ref={textInputRef}
            style={styles.searchInput}
            placeholder={t.videoUrlPlaceholder}
            placeholderTextColor="#999"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="go"
            autoCapitalize="none"
            autoCorrect={false}
            multiline={false}
            scrollEnabled={false}
            onFocus={() => {
              // 포커스 시 전체 선택
              if (query && textInputRef.current) {
                // React Native에서 TextInput 전체 선택
                setTimeout(() => {
                  if (textInputRef.current) {
                    textInputRef.current.setNativeProps({
                      selection: { start: 0, end: query.length }
                    });
                  }
                }, 50);
              }
            }}
            selectTextOnFocus={true}
          />
          {query.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                setQuery('');
                setResults([]);
                // route params도 초기화
                navigation.setParams({
                  url: undefined,
                  timestamp: undefined,
                  forceUpdate: false,
                  forceReload: false,
                });
                lastProcessedUrl.current = null;
              }}
            >
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>{t.getVideo}</Text>
        </TouchableOpacity>
      </View>

      {/* 다운로드한 파일 섹션 - 항상 고정 위치 */}
      {downloadedFiles.length > 0 && (
        <View style={styles.downloadedFilesSection}>
          <Text style={styles.downloadedFilesTitle}>{t.savedFiles}</Text>
          <FlatList
            key="downloaded-files-list"
            data={downloadedFiles}
            renderItem={renderDownloadedFileItem}
            keyExtractor={(item, index) => `downloaded-${item.fileUri || item.fileName || index}`}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.downloadedFilesList}
            nestedScrollEnabled={true}
          />
        </View>
      )}

      <View style={styles.resultsContainer}>
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#FF0000" />
            <Text style={styles.loadingText}>{t.loadingVideoInfo}</Text>
          </View>
        ) : (
          <FlatList
            key="results-list"
            data={results}
            renderItem={renderVideoItem}
            keyExtractor={(item, index) => `result-${item.id || `index-${index}`}`}
            removeClippedSubviews={false}
            maxToRenderPerBatch={10}
            windowSize={10}
            ListEmptyComponent={
              <View style={styles.centerContainer}>
                <TouchableOpacity 
                  onPress={openVideoApp}
                  activeOpacity={0.7}
                >
                  <Animated.View 
                    style={[
                      styles.videoIconButton,
                      { transform: [{ scale: pulseAnim }] }
                    ]}
                  >
                    <Text style={styles.emptyIcon}>📺</Text>
                    <Text style={styles.iconHintText}>{t.getVideoHint}</Text>
                  </Animated.View>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={styles.emptyText}>{t.shareFromVideoApp}</Text>
                  <Ionicons name="arrow-redo-outline" size={18} color="#333" style={{ marginLeft: 6 }} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={styles.emptySubText}>
                    {t.orCopyVideoUrl}
                  </Text>
                  <Ionicons name="copy-outline" size={16} color="#666" style={{ marginLeft: 6 }} />
                </View>
              </View>
            }
            contentContainerStyle={results.length === 0 ? styles.listContentEmpty : styles.listContent}
            ListFooterComponent={results.length > 0 ? <AdBanner style={{ marginTop: 20 }} /> : null}
          />
        )}
      </View>
      
      {/* ✅ 커스텀 Alert 모달 (빨간 글씨 안내 메시지 포함) */}
      <Modal
        visible={customAlert.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setCustomAlert({ visible: false, title: '', message: '', subMessage: '', onConfirm: null });
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{customAlert.title}</Text>
            <Text style={styles.modalMessage}>{customAlert.message}</Text>
            {customAlert.subMessage && (
              <Text style={styles.modalSubMessage}>{customAlert.subMessage}</Text>
            )}
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                if (customAlert.onConfirm) {
                  customAlert.onConfirm();
                } else {
                  setCustomAlert({ visible: false, title: '', message: '', subMessage: '', onConfirm: null });
                }
              }}
            >
              <Text style={styles.modalButtonText}>{t.ok}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  logoIcon3D: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8, // Android
    transform: [{ rotateY: '15deg' }, { perspective: 1000 }],
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  searchSection: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    alignItems: 'center',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 8,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  linkIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 48,
    fontSize: 14,
    includeFontPadding: false,
    textAlignVertical: 'center',
    paddingVertical: 0,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  searchButton: {
    height: 48,
    paddingHorizontal: 24,
    backgroundColor: '#FF0000',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  emptyIcon: {
    fontSize: 72,
    marginBottom: 0,
    textAlign: 'center',
  },
  videoIconButton: {
    padding: 24,
    borderRadius: 28,
    backgroundColor: '#fff',
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#FF0000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF0000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
    minWidth: 160,
    maxWidth: 200,
  },
  iconHintText: {
    fontSize: 16,
    color: '#FF0000',
    fontWeight: '700',
    marginTop: 10,
    textAlign: 'center',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
    marginTop: 8,
    lineHeight: 24,
  },
  emptySubText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
    fontWeight: '400',
  },
  highlightedText: {
    color: '#FF0000',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  listContent: {
    padding: 16,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  videoItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    marginHorizontal: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  videoThumbnail: {
    width: '100%',
    height: 200,
    backgroundColor: '#ddd',
  },
  videoContent: {
    padding: 16,
    position: 'relative',
  },
  removeResultButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 4,
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    lineHeight: 22,
    paddingRight: 32,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
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
  videoButton: {
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
  audioButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  buttonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  videoButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  audioButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  downloadedFilesSection: {
    paddingVertical: 16,
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: 0,
    paddingRight: 0,
    backgroundColor: '#fff',
    marginBottom: 0,
  },
  downloadedFilesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  downloadedFilesList: {
    paddingLeft: 16,
    paddingRight: 16,
  },
  downloadedFileItemFirst: {
    marginLeft: 0,
  },
  downloadedFileItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginLeft: 0,
    marginRight: 12,
    width: 280,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  downloadedFileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  downloadedFileThumbnailContainer: {
    width: 60,
    height: 45,
    marginRight: 12,
    position: 'relative',
  },
  downloadedFileThumbnail: {
    width: 60,
    height: 45,
    borderRadius: 8,
    backgroundColor: '#ddd',
  },
  downloadedFileThumbnailPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  downloadedFileThumbnailIcon: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadedFileDetails: {
    flex: 1,
  },
  downloadedFileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  downloadedFileSize: {
    fontSize: 12,
    color: '#999',
  },
  downloadedFileActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  downloadedFileActionButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  buttonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  videoThumbnailDisabled: {
    opacity: 0.6,
  },
  downloadedActionsContainer: {
    marginTop: 8,
    gap: 8,
  },
  downloadedActionsRowContainer: {
    marginBottom: 8,
  },
  downloadedActionsRowLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 4,
  },
  downloadedActionsRowLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF0000',
  },
  downloadedActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  downloadedActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  downloadedActionText: {
    fontSize: 11,
    color: '#666',
    marginLeft: 4,
    fontWeight: '500',
  },
  deleteActionButton: {
    backgroundColor: '#ffebee',
  },
  deleteActionText: {
    color: '#f44336',
  },
  downloadingContainer: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
  },
  downloadingExpectedSize: {
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
  },
  downloadingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  downloadingProgressWrap: {
    flex: 1,
    marginLeft: 8,
  },
  downloadingText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  downloadingProgressBar: {
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  downloadingProgressBarFill: {
    height: '100%',
    backgroundColor: '#FF0000',
    borderRadius: 3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
  modalSubMessage: {
    fontSize: 12,
    color: '#f44336',
    marginTop: 8,
    lineHeight: 18,
    fontWeight: '500',
  },
  modalButton: {
    backgroundColor: '#FF0000',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 16,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
