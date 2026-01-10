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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AdBanner from '../components/AdBanner';
import { addFavorite, removeFavorite, isFavorite, initDatabase } from '../services/database';
import { downloadVideo, downloadAudio, shareDownloadedFile, saveFileToDevice, getFileInfo, sanitizeFileName, getDownloadedFiles } from '../services/downloadService';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system/legacy';
import MediaStoreModule from '../modules/MediaStoreModule';

export default function SearchScreen({ navigation, route }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState(new Set()); // 즐겨찾기 ID Set
  const [downloading, setDownloading] = useState({}); // 다운로드 중인 항목 { videoId: { type: 'video'|'audio', progress: 0-1 } }
  const [downloadedFiles, setDownloadedFiles] = useState([]); // 다운로드한 파일 목록
  const textInputRef = useRef(null);
  const lastProcessedUrl = useRef(null);
  
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
      setDownloadedFiles(files);
      console.log('[SearchScreen] Loaded downloaded files:', files.length);
    } catch (error) {
      console.error('[SearchScreen] Error loading downloaded files:', error);
    }
  }, []);

  // 화면 포커스 시 다운로드한 파일 목록 로드
  useFocusEffect(
    useCallback(() => {
      loadDownloadedFiles();
    }, [loadDownloadedFiles])
  );

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
    
    // 정규화된 YouTube URL로 변환
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
      console.log('[SearchScreen] Invalid YouTube URL:', cleanUrl);
      setLoading(false);
      return;
    }
    
    // 정규화된 URL 생성 (타임스탬프나 불필요한 파라미터 제거)
    const normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // YouTube oEmbed API를 사용하여 비디오 정보 가져오기
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
          title: data.title || `YouTube Video (${videoId})`,
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
          title: `YouTube Video (${videoId})`,
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
  }, []);

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
      Alert.alert('오류', '즐겨찾기 저장 중 오류가 발생했습니다.');
    }
  };

  const handleDownloadVideo = async (item) => {
    if (!item.url || !item.id) {
      Alert.alert('오류', '다운로드할 영상 정보가 없습니다.');
      return;
    }

    try {
      setDownloading(prev => ({ ...prev, [item.id]: { type: 'video', progress: 0 } }));
      
      Alert.alert('알림', '영상 다운로드를 시작합니다. 다운로드가 완료되면 알림이 표시됩니다.');
      
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
      
      // 다운로드한 파일 목록 새로고침
      loadDownloadedFiles();
      
      // 파일 정보 확인
      const fileInfo = await getFileInfo(fileUri);
      const fileSizeText = fileInfo?.size ? `(${(fileInfo.size / (1024 * 1024)).toFixed(2)} MB)` : '';
      
      Alert.alert(
        '다운로드 완료',
        `영상 다운로드가 완료되었습니다. ${fileSizeText}`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '저장하기',
            onPress: async () => {
              try {
                const fileName = `${item.title || 'video'}.mp4`;
                await saveFileToDevice(fileUri, fileName, true);
                Alert.alert('알림', '영상파일이 갤러리에 저장되었습니다.\n\n저장 위치: Movies/YouTube Videos');
              } catch (error) {
                console.error('[SearchScreen] Error saving file:', error);
                Alert.alert('오류', error.message || '파일 저장 중 오류가 발생했습니다.');
              }
            }
          },
          {
            text: '공유하기',
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
      Alert.alert('오류', error.message || '영상 다운로드 중 오류가 발생했습니다.');
    }

    // 아래 코드는 백엔드 서버가 준비되면 활성화
    /*
    try {
      setDownloading(prev => ({ ...prev, [item.id]: { type: 'video', progress: 0 } }));
      
      Alert.alert('알림', '영상 다운로드를 시작합니다. 다운로드가 완료되면 알림이 표시됩니다.');
      
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
        '다운로드 완료',
        '영상 다운로드가 완료되었습니다.',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '공유하기',
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
      Alert.alert('오류', error.message || '영상 다운로드 중 오류가 발생했습니다.');
    }
    */
  };

  const handleDownloadAudio = async (item) => {
    if (!item.url || !item.id) {
      Alert.alert('오류', '다운로드할 음악 정보가 없습니다.');
      return;
    }

    try {
      setDownloading(prev => ({ ...prev, [item.id]: { type: 'audio', progress: 0 } }));
      
      Alert.alert('알림', '음악 다운로드를 시작합니다. 다운로드가 완료되면 알림이 표시됩니다.');
      
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
      
      // 다운로드한 파일 목록 새로고침
      loadDownloadedFiles();
      
      // 파일 정보 확인
      const fileInfo = await getFileInfo(fileUri);
      const fileSizeText = fileInfo?.size ? `(${(fileInfo.size / (1024 * 1024)).toFixed(2)} MB)` : '';
      
      Alert.alert(
        '다운로드 완료',
        `음악 다운로드가 완료되었습니다. ${fileSizeText}`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '저장하기',
            onPress: async () => {
              try {
                const fileName = `${item.title || 'audio'}.m4a`;
                await saveFileToDevice(fileUri, fileName, false);
                Alert.alert('알림', '음악파일이 음악 앱에 저장되었습니다.\n\n저장 위치: Music/YouTube Audio');
              } catch (error) {
                console.error('[SearchScreen] Error saving file:', error);
                Alert.alert('오류', error.message || '파일 저장 중 오류가 발생했습니다.');
              }
            }
          },
          {
            text: '공유하기',
            onPress: () => shareDownloadedFile(fileUri, `${item.title || 'audio'}.m4a`, false)
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
      Alert.alert('오류', error.message || '음악 다운로드 중 오류가 발생했습니다.');
    }

    // 아래 코드는 백엔드 서버가 준비되면 활성화
    /*
    try {
      setDownloading(prev => ({ ...prev, [item.id]: { type: 'audio', progress: 0 } }));
      
      Alert.alert('알림', '음악 다운로드를 시작합니다. 다운로드가 완료되면 알림이 표시됩니다.');
      
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
        '다운로드 완료',
        '음악 다운로드가 완료되었습니다.',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '공유하기',
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
      Alert.alert('오류', error.message || '음악 다운로드 중 오류가 발생했습니다.');
    }
    */
  };

  const handleOpenYouTube = async (item) => {
    if (!item.url) {
      Alert.alert('오류', 'YouTube URL을 찾을 수 없습니다.');
      return;
    }

    try {
      const youtubeUrl = item.url;
      console.log('[SearchScreen] Opening YouTube URL:', youtubeUrl);
      
      // YouTube 앱으로 열기 시도
      const canOpen = await Linking.canOpenURL(youtubeUrl);
      if (canOpen) {
        await Linking.openURL(youtubeUrl);
      } else {
        Alert.alert('오류', 'YouTube를 열 수 없습니다.');
      }
    } catch (error) {
      console.error('[SearchScreen] Error opening YouTube:', error);
      Alert.alert('오류', 'YouTube를 열 수 없습니다.');
    }
  };

  // 다운로드한 파일 재생 (외부 플레이어로 열기)
  const handlePlayFile = async (file) => {
    try {
      if (Platform.OS === 'android') {
        // 파일 존재 확인
        const fileInfo = await FileSystem.getInfoAsync(file.fileUri);
        if (!fileInfo.exists) {
          Alert.alert('오류', '파일을 찾을 수 없습니다.');
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
        
        // FileProvider를 사용하여 content:// URI 생성
        if (MediaStoreModule && typeof MediaStoreModule.getContentUri === 'function') {
          const contentUri = await MediaStoreModule.getContentUri(file.fileUri);
          
          // Intent를 사용하여 외부 플레이어로 파일 열기
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: contentUri,
            type: mimeType,
            flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          });
        } else {
          Alert.alert('오류', '파일 재생 기능을 사용할 수 없습니다. 앱을 재빌드해주세요.');
        }
      } else {
        Alert.alert('알림', 'iOS에서는 이 기능을 지원하지 않습니다.');
      }
    } catch (error) {
      console.error('[SearchScreen] Error playing file:', error);
      console.error('[SearchScreen] Error details:', JSON.stringify(error, null, 2));
      Alert.alert('오류', `파일을 재생할 수 없습니다: ${error.message || '알 수 없는 오류'}`);
    }
  };

  // 다운로드한 파일 재저장
  const handleResaveFile = async (file) => {
    try {
      await saveFileToDevice(file.fileUri, file.fileName, file.isVideo);
      Alert.alert(
        '알림',
        file.isVideo 
          ? '영상파일이 갤러리에 저장되었습니다.\n\n저장 위치: Movies/YouTube Videos'
          : '음악파일이 음악 앱에 저장되었습니다.\n\n저장 위치: Music/YouTube Audio'
      );
      // 저장 후 파일 목록 새로고침
      loadDownloadedFiles();
    } catch (error) {
      console.error('[SearchScreen] Error resaving file:', error);
      Alert.alert('오류', error.message || '파일 저장 중 오류가 발생했습니다.');
    }
  };

  // 다운로드한 파일 항목 렌더링
  const renderDownloadedFileItem = ({ item, index }) => {
    const fileSizeMB = (item.size / (1024 * 1024)).toFixed(2);
    
    return (
      <View style={[styles.downloadedFileItem, index === 0 && styles.downloadedFileItemFirst]}>
        <View style={styles.downloadedFileInfo}>
          <Ionicons 
            name={item.isVideo ? "videocam" : "musical-notes"} 
            size={24} 
            color={item.isVideo ? "#FF0000" : "#4CAF50"} 
            style={styles.downloadedFileIcon}
          />
          <View style={styles.downloadedFileDetails}>
            <Text style={styles.downloadedFileName} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.downloadedFileSize}>
              {fileSizeMB} MB • {item.isVideo ? '영상' : '음악'}
            </Text>
          </View>
        </View>
        <View style={styles.downloadedFileActions}>
          <TouchableOpacity
            style={styles.downloadedFileActionButton}
            onPress={() => handlePlayFile(item)}
          >
            <Ionicons name="play" size={20} color={item.isVideo ? "#FF0000" : "#4CAF50"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.downloadedFileActionButton}
            onPress={() => shareDownloadedFile(item.fileUri, item.fileName, item.isVideo)}
          >
            <Ionicons name="share" size={20} color="#2196F3" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.downloadedFileActionButton}
            onPress={() => handleResaveFile(item)}
          >
            <Ionicons name="save" size={20} color="#FF9800" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // 검색 결과 항목 제거
  const handleRemoveResult = (item) => {
    setResults(prevResults => prevResults.filter(result => result.id !== item.id));
  };

  const renderVideoItem = ({ item }) => {
    const isDownloadingVideo = downloading[item.id]?.type === 'video';
    const isDownloadingAudio = downloading[item.id]?.type === 'audio';
    const downloadProgress = downloading[item.id]?.progress || 0;
    const isDownloading = isDownloadingVideo || isDownloadingAudio;
    
    return (
      <TouchableOpacity 
        style={styles.videoItem}
        onPress={() => handleOpenYouTube(item)}
        activeOpacity={0.8}
      >
        {item.thumbnail && (
          <Image 
            source={{ uri: item.thumbnail }} 
            style={styles.videoThumbnail}
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
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.favoriteButton}
              onPress={(e) => {
                e.stopPropagation(); // 부모 TouchableOpacity의 onPress 방지
                handleAddFavorite(item);
              }}
            >
              <Ionicons 
                name={favorites.has(item.id) ? "star" : "star-outline"} 
                size={20} 
                color={favorites.has(item.id) ? "#FFD700" : "#999"} 
              />
              <Text style={styles.buttonText}>찜하기</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.videoButton,
                (isDownloading && !isDownloadingVideo) && styles.buttonDisabled
              ]}
              onPress={(e) => {
                e.stopPropagation(); // 부모 TouchableOpacity의 onPress 방지
                if (!isDownloading) {
                  handleDownloadVideo(item);
                }
              }}
              disabled={isDownloading}
            >
              {isDownloadingVideo ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.videoButtonText}>
                    {Math.round(downloadProgress * 100)}%
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="videocam" size={20} color="#fff" />
                  <Text style={styles.videoButtonText}>영상다운</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.audioButton,
                (isDownloading && !isDownloadingAudio) && styles.buttonDisabled
              ]}
              onPress={(e) => {
                e.stopPropagation(); // 부모 TouchableOpacity의 onPress 방지
                if (!isDownloading) {
                  handleDownloadAudio(item);
                }
              }}
              disabled={isDownloading}
            >
              {isDownloadingAudio ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.audioButtonText}>
                    {Math.round(downloadProgress * 100)}%
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="musical-notes" size={20} color="#fff" />
                  <Text style={styles.audioButtonText}>음악다운</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
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
              // 이미 다운로드 화면에 있으므로 스크롤을 맨 위로 이동하거나 새로고침
              setQuery('');
              setResults([]);
              if (textInputRef.current) {
                textInputRef.current.focus();
              }
            }}
            activeOpacity={0.7}
          >
            <Image 
              source={require('../../assets/icon.png')} 
              style={styles.logoImage}
              resizeMode="cover"
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>유튜브 다운로더</Text>
        </View>
      </SafeAreaView>

      <View style={styles.searchSection}>
        <View style={styles.inputContainer}>
          <Ionicons name="link" size={20} color="#999" style={styles.linkIcon} />
          <TextInput
            ref={textInputRef}
            style={styles.searchInput}
            placeholder="YouTube URL을 입력하거나"
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
        </View>
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>가져오기</Text>
        </TouchableOpacity>
      </View>

      {/* 다운로드한 파일 섹션 - 항상 고정 위치 */}
      {downloadedFiles.length > 0 && (
        <View style={styles.downloadedFilesSection}>
          <Text style={styles.downloadedFilesTitle}>다운로드한 파일</Text>
          <FlatList
            data={downloadedFiles}
            renderItem={renderDownloadedFileItem}
            keyExtractor={(item, index) => item.fileUri || index.toString()}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.downloadedFilesList}
          />
        </View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FF0000" />
          <Text style={styles.loadingText}>영상 정보 가져오는 중...</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          renderItem={renderVideoItem}
          keyExtractor={(item, index) => item.id || index.toString()}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyIcon}>📺</Text>
              <Text style={styles.emptyText}>YouTube URL을 입력하세요</Text>
              <Text style={styles.emptySubText}>
                또는 YouTube 앱에서 공유하기를{'\n'}사용하세요
              </Text>
            </View>
          }
          contentContainerStyle={results.length === 0 ? styles.listContentEmpty : styles.listContent}
          ListFooterComponent={results.length > 0 ? <AdBanner style={{ marginTop: 20 }} /> : null}
        />
      )}
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
    backgroundColor: '#FF0000',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 8 : 0,
    paddingBottom: 12,
    minHeight: 56,
  },
  logoContainer: {
    marginRight: 12,
    width: 52,
    height: 52,
    overflow: 'hidden',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 68,
    height: 68,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: 'bold',
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubText: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
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
  downloadedFileIcon: {
    marginRight: 12,
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
});
