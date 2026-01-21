import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
  StatusBar,
  Alert,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as IntentLauncher from 'expo-intent-launcher';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Audio } from 'expo-av';
import AdBanner from '../components/AdBanner';
import MiniPlayer from '../components/MiniPlayer';
import LanguageSelector from '../components/LanguageSelector';
import PinManagerModal from '../components/PinManagerModal';
import PinSelectorModal from '../components/PinSelectorModal';
import { getLocalAudioFiles, getLocalVideoFiles, getLocalAllFiles, deleteLocalFile, getLocalFilesCount } from '../services/localFileService';
import { getPlaylists, createPlaylist, updatePlaylist, deletePlaylist, assignFileToPlaylist, getPlaylistsForFile } from '../services/playlistService';
import mediaSessionService from '../services/mediaSessionService';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../locales/translations';
import MediaStoreModule from '../modules/MediaStoreModule';

export default function LocalFilesScreen({ navigation }) {
  const { currentLanguage } = useLanguage();
  const t = translations[currentLanguage];
  const [localFiles, setLocalFiles] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('all'); // 'all' | 'video' | 'audio'
  const [sortBy, setSortBy] = useState('date-desc');
  const [showFilters, setShowFilters] = useState(false);
  const [playlistFilter, setPlaylistFilter] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [showPlaylistManager, setShowPlaylistManager] = useState(false);
  const [showPlaylistSelector, setShowPlaylistSelector] = useState(false);
  const [selectedFileForPlaylist, setSelectedFileForPlaylist] = useState(null);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState([]);
  
  // 페이지네이션
  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor] = useState(null);
  const endCursorRef = useRef(null);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // 재생 관련 상태
  const [playlist, setPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sound, setSound] = useState(null);
  const soundRef = useRef(null);
  const playlistRef = useRef([]);
  const currentIndexRef = useRef(0);
  const prevPlaylistFilterRef = useRef(null); // 이전 playlistFilter 값 저장
  const [playingPlaylistFilter, setPlayingPlaylistFilter] = useState(null);
  const [hasPermission, setHasPermission] = useState(null); // null: 확인 중, true: 있음, false: 없음
  const isPlayingRef = useRef(false); // 재생 중인지 확인하는 ref (race condition 방지)

  // 권한 체크
  const checkPermission = useCallback(async () => {
    try {
      if (Platform.OS !== 'android') {
        console.log('[LocalFilesScreen] Not Android, setting permission to false');
        setHasPermission(false);
        return false;
      }
      console.log('[LocalFilesScreen] Checking media library permission...');
      const { status } = await MediaLibrary.getPermissionsAsync();
      const granted = status === 'granted';
      console.log('[LocalFilesScreen] Permission status:', status, 'granted:', granted);
      setHasPermission(granted);
      return granted;
    } catch (error) {
      console.error('[LocalFilesScreen] Error checking permission:', error);
      setHasPermission(false);
      return false;
    }
  }, []);

  // 권한 요청
  const requestPermission = useCallback(async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      const granted = status === 'granted';
      setHasPermission(granted);
      if (granted) {
        loadLocalFiles(true);
      }
      return granted;
    } catch (error) {
      console.error('[LocalFilesScreen] Error requesting permission:', error);
      setHasPermission(false);
      return false;
    }
  }, [loadLocalFiles]);

  // 플레이리스트 목록 로드
  const loadPlaylists = useCallback(async () => {
    try {
      const playlistsList = await getPlaylists();
      setPlaylists(playlistsList);
    } catch (error) {
      console.error('[LocalFilesScreen] Error loading playlists:', error);
    }
  }, []);

  // 로컬 파일 목록 로드 (페이지네이션)
  const loadLocalFiles = useCallback(async (reset = false) => {
    try {
      console.log('[LocalFilesScreen] loadLocalFiles called, reset:', reset);
      
      if (reset) {
        setLoading(true);
        setLocalFiles([]);
        setEndCursor(null);
        endCursorRef.current = null;
      }

      // 권한 체크
      const hasPerm = await checkPermission();
      console.log('[LocalFilesScreen] loadLocalFiles - permission check:', hasPerm);
      if (!hasPerm) {
        console.warn('[LocalFilesScreen] loadLocalFiles - no permission, returning');
        setLoading(false);
        return;
      }

      const options = {
        first: 50,
        after: reset ? null : (endCursorRef.current || null),
      };

      console.log('[LocalFilesScreen] loadLocalFiles - calling getLocalAllFiles with options:', options);
      // 항상 모든 파일을 로드 (fileTypeFilter는 UI 필터링에만 사용)
      const result = await getLocalAllFiles(options);
      console.log('[LocalFilesScreen] loadLocalFiles - getLocalAllFiles result:', {
        filesCount: result.files.length,
        hasNextPage: result.hasNextPage,
      });

      // 전체 파일 개수 확인 (첫 페이지 또는 리셋 시에만)
      if (reset || localFiles.length === 0) {
        const totalCount = await getLocalFilesCount();
        console.log('[LocalFilesScreen] Total files on device:', totalCount);
        console.log('[LocalFilesScreen] Current loaded files:', localFiles.length);
      }

      console.log('[LocalFilesScreen] loadLocalFiles result:', {
        reset,
        filesCount: result.files.length,
        hasNextPage: result.hasNextPage,
        endCursor: result.endCursor,
        currentTotal: reset ? 0 : localFiles.length,
        newTotal: reset ? result.files.length : localFiles.length + result.files.length,
      });

      setHasNextPage(result.hasNextPage);
      setEndCursor(result.endCursor);
      endCursorRef.current = result.endCursor;

      // 각 파일의 플레이리스트 정보 로드 (새로 로드한 파일만)
      const filesWithPlaylists = await Promise.all(
        result.files.map(async (file) => {
          const filePlaylists = await getPlaylistsForFile(file.fileUri);
          return {
            ...file,
            playlist_ids: filePlaylists.map(p => p.playlist_id),
            playlist_names: filePlaylists.map(p => p.playlist_name),
          };
        })
      );

      // state 업데이트 (함수형 업데이트 사용하여 최신 state 보장)
      if (reset) {
        setLocalFiles(filesWithPlaylists);
      } else {
        setLocalFiles(prev => [...prev, ...filesWithPlaylists]);
      }
    } catch (error) {
      console.error('[LocalFilesScreen] Error loading local files:', error);
      Alert.alert(t.error, t.loadFilesError || '파일을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t, checkPermission]);

  // 초기 로드 (권한이 있을 때만)
  useEffect(() => {
    if (hasPermission === true && localFiles.length === 0) {
      loadLocalFiles(true);
    }
  }, [hasPermission, loadLocalFiles, localFiles.length]);

  // 검색, 필터링 및 정렬
  useEffect(() => {
    let filtered = [...localFiles];
    
    // 파일 타입 필터링
    if (fileTypeFilter === 'video') {
      filtered = filtered.filter(file => file.isVideo);
    } else if (fileTypeFilter === 'audio') {
      filtered = filtered.filter(file => !file.isVideo);
    }
    // fileTypeFilter === 'all'이면 모든 파일 표시
    
    // 플레이리스트 필터링
    if (playlistFilter) {
      filtered = filtered.filter(file => {
        const playlistIds = file.playlist_ids || [];
        return playlistIds.includes(playlistFilter);
      });
      
      // 필터링 후 결과가 없으면 해당 필터 제거하고 전체로 전환
      if (filtered.length === 0) {
        setPlaylistFilter(null);
        // 전체 필터로 다시 필터링
        filtered = [...localFiles];
        // 파일 타입 필터는 유지
        if (fileTypeFilter === 'video') {
          filtered = filtered.filter(file => file.isVideo);
        } else if (fileTypeFilter === 'audio') {
          filtered = filtered.filter(file => !file.isVideo);
        }
      }
    }
    // playlistFilter === null이면 전체 표시
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(file =>
        file.title.toLowerCase().includes(query) ||
        file.fileName.toLowerCase().includes(query)
      );
    }
    
    // ✅ 정렬 적용
    if (sortBy && sortBy.startsWith('date')) {
      // 날짜 정렬 (downloadedAt 기준, 타입과 무관하게 최신순)
      filtered.sort((a, b) => {
        // downloadedAt이 있으면 숫자 비교
        const timeA = a.downloadedAt || 0;
        const timeB = b.downloadedAt || 0;
        
        // 숫자 타입 확인 및 변환
        const numA = typeof timeA === 'number' ? timeA : (typeof timeA === 'string' ? parseFloat(timeA) : 0);
        const numB = typeof timeB === 'number' ? timeB : (typeof timeB === 'string' ? parseFloat(timeB) : 0);
        
        if (numA && numB) {
          // 둘 다 downloadedAt이 있으면 숫자 비교 (최신순: 큰 값이 먼저)
          const dateDiff = sortBy === 'date-desc' ? numB - numA : numA - numB;
          
          // 같은 downloadedAt이면 타입과 무관하게 원래 순서 유지 (안정 정렬)
          // 하지만 사용자가 "영상이 항상 마지막"이라고 하니, 같은 시간이면 추가 비교 필요
          if (dateDiff === 0) {
            // 같은 downloadedAt이면 파일명으로 추가 비교 (안정 정렬 보장)
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
          // 둘 다 없으면 파일명으로 정렬 (fallback)
          const aStr = a.fileName || '';
          const bStr = b.fileName || '';
          return sortBy === 'date-desc' ? bStr.localeCompare(aStr) : aStr.localeCompare(bStr);
        }
      });
    } else if (sortBy && sortBy.startsWith('title')) {
      // 제목 정렬
      filtered.sort((a, b) => {
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();
        const compare = titleA.localeCompare(titleB, 'ko');
        return sortBy === 'title-asc' ? compare : -compare;
      });
    }
    
    setFilteredFiles(filtered);
    
    // ✅ 재생 중인 플레이리스트가 필터링 결과와 다르면 업데이트
    // 단, playlistFilter가 변경된 경우는 제외 (기존 재생 유지)
    const isPlaylistFilterChanged = prevPlaylistFilterRef.current !== playlistFilter;
    prevPlaylistFilterRef.current = playlistFilter;
    
    // 재생 중이고, 재생 시작 시의 필터와 현재 필터가 다르면 재생 관련 로직 건너뛰기
    if (isPlaying && playingPlaylistFilter !== playlistFilter) {
      // 다른 필터로 변경했지만 재생은 계속 유지 (목록은 이미 setFilteredFiles로 설정됨)
      // playingPlaylistFilter === null (전체)이고 playlistFilter !== null인 경우도 포함
      return;
    }
    
    // 영상 필터일 때는 재생 관련 로직 건너뛰기 (음악 재생 유지)
    if (isPlaying && fileTypeFilter === 'video') {
      return;
    }
    
    if (playlist.length > 0 && isPlaying && !isPlaylistFilterChanged) {
      const audioFiles = filtered.filter(file => !file.isVideo);
      const currentItem = playlist[currentIndex];
      const newIndex = audioFiles.findIndex(file => file.fileUri === currentItem?.fileUri);
      
      if (newIndex >= 0 && audioFiles.length > 0) {
        setPlaylist(audioFiles);
        playlistRef.current = audioFiles; // ref에도 저장
        setCurrentIndex(newIndex);
        currentIndexRef.current = newIndex; // ref에도 저장
      } else if (audioFiles.length === 0 || newIndex < 0) {
        // 재생 중인 항목이 필터링 결과에 없으면 재생 중지
        // 단, 영상 필터일 때는 재생 유지 (위에서 이미 return됨)
        handleStopPlaylist();
      }
    }
  }, [searchQuery, localFiles, fileTypeFilter, sortBy, playlistFilter]);

  // 화면 포커스 시 새로고침
  useFocusEffect(
    useCallback(() => {
      loadPlaylists();
      checkPermission().then((hasPerm) => {
        if (hasPerm) {
          loadLocalFiles(true);
        }
      });
    }, [loadPlaylists, checkPermission, loadLocalFiles])
  );

  // 컴포넌트 마운트 시 초기화 및 권한 체크
  useEffect(() => {
    console.log('[LocalFilesScreen] Component mounted, checking permission...');
    // 초기 권한 체크 (즉시 실행)
    const initPermission = async () => {
      try {
        const hasPerm = await checkPermission();
        console.log('[LocalFilesScreen] Initial permission check result:', hasPerm);
        if (hasPerm) {
          // 전체 파일 개수 확인 및 로그 출력
          const count = await getLocalFilesCount();
          console.log('[LocalFilesScreen] Total files on device:', count);
        }
      } catch (error) {
        console.error('[LocalFilesScreen] Error in initPermission:', error);
        setHasPermission(false);
      }
    };
    initPermission();

    Audio.setAudioModeAsync({
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    }).catch(error => {
      console.error('[LocalFilesScreen] Error setting audio mode:', error);
    });

    mediaSessionService.initialize().catch(error => {
      console.error('[LocalFilesScreen] Error initializing media session service:', error);
    });

    mediaSessionService.setCallbacks({
      onPlayPause: handlePlayPause,
      onPlay: handlePlay,
      onPause: handlePause,
      onNext: handleNext,
      onPrevious: handlePrevious,
      onStop: handleStopPlaylist,
    });

    return () => {
      mediaSessionService.dismiss().catch(error => {
        console.error('[LocalFilesScreen] Error dismissing media session:', error);
      });
    };
  }, [checkPermission, loadLocalFiles]);

  // 오디오 파일 재생
  const playAudioFile = async (file, index) => {
    // 이미 재생 중이면 무시 (race condition 방지)
    if (isPlayingRef.current) {
      console.log('[LocalFilesScreen] Already playing, ignoring request');
      return;
    }
    
    try {
      await Audio.setAudioModeAsync({
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
      });

      await mediaSessionService.ensureInitialized();

      // 이전 재생 정리
      if (soundRef.current) {
        try {
          await soundRef.current.unloadAsync();
        } catch (unloadError) {
          console.warn('[LocalFilesScreen] Error unloading previous sound:', unloadError);
        }
      }
      
      // 이전 재생 정리 완료 후 플래그 설정 (race condition 방지)
      isPlayingRef.current = true;

      // localFileService에서 이미 content:// URI를 반환하므로 그대로 사용
      // file:// URI는 사용하지 않음 (Scoped Storage 제한)
      let playUri = file.fileUri;
      if (playUri.startsWith('file://')) {
        // file:// URI가 감지되면 (이상한 경우) 원래 fileUri 사용
        // localFileService에서 이미 content:// URI를 반환하므로 이 경우는 발생하지 않아야 함
        console.warn('[LocalFilesScreen] file:// URI detected in file.fileUri, this should not happen');
        playUri = file.fileUri; // 그래도 원래 값 사용 (fallback)
      }

      console.log('[LocalFilesScreen] Playing audio from URI:', playUri);
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: playUri },
        { shouldPlay: true }
      );

      soundRef.current = newSound;
      setSound(newSound);
      setIsPlaying(true);
      setCurrentIndex(index);
      currentIndexRef.current = index;

      const currentPlaylistForUpdate = playlistRef.current.length > 0 ? playlistRef.current : playlist;
      const canGoNext = index < currentPlaylistForUpdate.length - 1;
      const canGoPrevious = index > 0;

      await mediaSessionService.updateMetadata({
        id: file.id || index,
        title: file.title || file.fileName,
        author: file.author || '',
        thumbnail: file.thumbnail || null,
      });
      await mediaSessionService.updatePlaybackState(true, canGoNext, canGoPrevious);

      newSound.setOnPlaybackStatusUpdate((status) => {
        // 재생이 실제로 시작되었을 때 플래그 해제 (다음 곡으로 넘어갈 수 있도록)
        if (status.isPlaying && isPlayingRef.current) {
          isPlayingRef.current = false;
        }
        if (status.didJustFinish && !status.isLooping) {
          handleNext();
        }
      });
    } catch (error) {
      isPlayingRef.current = false; // 오류 발생 시에도 플래그 해제
      console.error('[LocalFilesScreen] Error playing audio:', error);
      
      // UnrecognizedInputFormatException 등 ExoPlayer 오류인 경우 외부 플레이어로 폴백
      if (error.message && (
        error.message.includes('UnrecognizedInputFormatException') ||
        error.message.includes('extractors') ||
        error.message.includes('could read the stream')
      )) {
        console.log('[LocalFilesScreen] ExoPlayer format error, trying external player for:', file.title);
        try {
          await handlePlayFile(file);
        } catch (externalPlayerError) {
          console.error('[LocalFilesScreen] External player also failed:', externalPlayerError);
          Alert.alert(
            t.error, 
            `내부 플레이어와 외부 플레이어 모두 재생에 실패했습니다.\n\n파일: ${file.title}\n오류: ${error.message || t.unknownError}`
          );
        }
      } else {
        Alert.alert(t.error, t.cannotPlayFile?.replace('{error}', error.message || t.unknownError) || '재생할 수 없습니다.');
      }
      throw error;
    }
  };

  // 전체 재생
  const handlePlayAll = async () => {
    try {
      // 재생 중이고, 현재 필터가 재생 시작 시의 필터와 일치할 때만 일시정지/재생 토글
      if (isPlaying && playlist.length > 0 && playingPlaylistFilter === playlistFilter) {
        await handlePlayPause();
        return;
      }

      const audioFiles = filteredFiles.filter(f => !f.isVideo);
      if (audioFiles.length === 0) {
        Alert.alert(t.notice, t.noMusicFiles || '재생할 음악 파일이 없습니다.');
        return;
      }

      // 기존 재생 중지 (다른 필터에서 재생 중이거나 새로 시작하는 경우)
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      setPlaylist(audioFiles);
      playlistRef.current = audioFiles;
      setPlayingPlaylistFilter(playlistFilter);
      await playAudioFile(audioFiles[0], 0);
    } catch (error) {
      console.error('[LocalFilesScreen] Error starting playlist:', error);
      Alert.alert(t.error, t.playMusicError || '재생할 수 없습니다.');
    }
  };

  // 재생/일시정지
  const handlePlayPause = async () => {
    try {
      if (!soundRef.current) return;
      const status = await soundRef.current.getStatusAsync();
      if (status.isPlaying) {
        await handlePause();
      } else {
        await handlePlay();
      }
    } catch (error) {
      console.error('[LocalFilesScreen] Error toggling play/pause:', error);
    }
  };

  const handlePlay = async () => {
    try {
      if (!soundRef.current) return;
      await soundRef.current.playAsync();
      setIsPlaying(true);
      const currentPlaylistForPause = playlistRef.current.length > 0 ? playlistRef.current : playlist;
      const currentFileIndexForPause = currentIndexRef.current >= 0 ? currentIndexRef.current : currentIndex;
      if (currentPlaylistForPause[currentFileIndexForPause]) {
        const canGoNext = currentFileIndexForPause < currentPlaylistForPause.length - 1;
        const canGoPrevious = currentFileIndexForPause > 0;
        await mediaSessionService.updatePlaybackState(true, canGoNext, canGoPrevious);
      }
    } catch (error) {
      console.error('[LocalFilesScreen] Error playing:', error);
    }
  };

  const handlePause = async () => {
    try {
      if (!soundRef.current) return;
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
      const currentPlaylistForPause = playlistRef.current.length > 0 ? playlistRef.current : playlist;
      const currentFileIndexForPause = currentIndexRef.current >= 0 ? currentIndexRef.current : currentIndex;
      if (currentPlaylistForPause[currentFileIndexForPause]) {
        const canGoNext = currentFileIndexForPause < currentPlaylistForPause.length - 1;
        const canGoPrevious = currentFileIndexForPause > 0;
        await mediaSessionService.updatePlaybackState(false, canGoNext, canGoPrevious);
      }
    } catch (error) {
      console.error('[LocalFilesScreen] Error pausing:', error);
    }
  };

  // 다음 곡
  const handleNext = async () => {
    // 재생 중이면 무시 (race condition 방지)
    if (isPlayingRef.current) {
      console.log('[LocalFilesScreen] handleNext: Already playing, ignoring');
      return;
    }
    
    const currentPlaylist = playlistRef.current.length > 0 ? playlistRef.current : playlist;
    const currentFileIndex = currentIndexRef.current >= 0 ? currentIndexRef.current : currentIndex;
    
    if (currentFileIndex < currentPlaylist.length - 1) {
      const nextIndex = currentFileIndex + 1;
      await playAudioFile(currentPlaylist[nextIndex], nextIndex);
    }
  };

  // 이전 곡
  const handlePrevious = async () => {
    // 재생 중이면 무시 (race condition 방지)
    if (isPlayingRef.current) {
      console.log('[LocalFilesScreen] handlePrevious: Already playing, ignoring');
      return;
    }
    
    const currentPlaylist = playlistRef.current.length > 0 ? playlistRef.current : playlist;
    const currentFileIndex = currentIndexRef.current >= 0 ? currentIndexRef.current : currentIndex;
    
    if (currentFileIndex > 0) {
      const prevIndex = currentFileIndex - 1;
      await playAudioFile(currentPlaylist[prevIndex], prevIndex);
    }
  };

  // 재생 중지
  const handleStopPlaylist = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      }
      setSound(null);
      soundRef.current = null;
      setIsPlaying(false);
      setPlaylist([]);
      playlistRef.current = [];
      setCurrentIndex(0);
      currentIndexRef.current = 0;
      await mediaSessionService.dismiss();
    } catch (error) {
      console.error('[LocalFilesScreen] Error stopping playlist:', error);
    }
  };

  // 파일 재생
  // "내폰" 탭은 localFileService가 content:// URI를 반환하므로 바로 사용
  const handlePlayFile = async (file) => {
    try {
      if (Platform.OS === 'android') {
        const fileUri = file.fileUri;
        
        // content:// URI 확인 (localFileService가 content:// URI를 반환해야 함)
        if (!fileUri || !fileUri.startsWith('content://')) {
          console.warn('[LocalFilesScreen] Invalid URI for local file (expected content://):', fileUri);
          // content:// URI가 아니면 내부 플레이어로 fallback (음악만)
          if (file.isVideo) {
            Alert.alert(t.error || '오류', '영상 파일을 열 수 없습니다.');
            return;
          } else {
            setPlaylist([file]);
            playlistRef.current = [file];
            await playAudioFile(file, 0);
            return;
          }
        }
        
        // MIME 타입 결정
        let mimeType = file.isVideo ? 'video/*' : 'audio/*';
        const extension = file.fileName.split('.').pop()?.toLowerCase();
        if (extension === 'mp4') {
          mimeType = 'video/mp4';
        } else if (extension === 'm4a') {
          mimeType = 'audio/mp4';
        } else if (extension === 'mp3') {
          mimeType = 'audio/mpeg';
        }
        
        // content:// URI로 외부 플레이어 열기
        // MediaStoreModule.openContentUri를 사용하여 권한을 제대로 부여
        console.log('[LocalFilesScreen] Opening with content:// URI:', fileUri);
        if (MediaStoreModule && typeof MediaStoreModule.openContentUri === 'function') {
          await MediaStoreModule.openContentUri(fileUri, mimeType);
        } else {
          // MediaStoreModule이 없으면 IntentLauncher 사용 (fallback)
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: fileUri,
            type: mimeType,
            flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          });
        }
      } else {
        // iOS 처리
        if (file.isVideo) {
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: file.fileUri,
            type: 'video/*',
            flags: 1,
          });
        } else {
          setPlaylist([file]);
          playlistRef.current = [file];
          await playAudioFile(file, 0);
        }
      }
    } catch (error) {
      console.error('[LocalFilesScreen] Error playing file:', error);
      Alert.alert(t.error || '오류', error.message || t.cannotPlayFile?.replace('{error}', error.message || t.unknownError) || '재생할 수 없습니다.');
    }
  };

  // 파일 공유
  // "내폰" 탭은 localFileService가 content:// URI를 반환하므로 MediaStoreModule.shareContentUri 사용
  // MediaStoreModule.shareContentUri는 네이티브에서 Intent를 직접 처리하여 content:// URI 권한을 제대로 부여
  const handleShareFile = async (file) => {
    try {
      if (Platform.OS === 'android') {
        const fileUri = file.fileUri;
        
        // content:// URI 확인 (localFileService가 content:// URI를 반환해야 함)
        if (!fileUri || !fileUri.startsWith('content://')) {
          console.warn('[LocalFilesScreen] Invalid URI for sharing (expected content://):', fileUri);
          Alert.alert(t.error || '오류', '파일을 공유할 수 없습니다.');
          return;
        }
        
        // MIME 타입 결정
        let mimeType = file.isVideo ? 'video/*' : 'audio/*';
        const extension = file.fileName.split('.').pop()?.toLowerCase();
        if (extension === 'mp4') {
          mimeType = 'video/mp4';
        } else if (extension === 'm4a') {
          mimeType = 'audio/mp4';
        } else if (extension === 'mp3') {
          mimeType = 'audio/mpeg';
        }
        
        // MediaStoreModule.shareContentUri 사용 (네이티브에서 Intent 직접 처리)
        if (MediaStoreModule && typeof MediaStoreModule.shareContentUri === 'function') {
          console.log('[LocalFilesScreen] Sharing with MediaStoreModule.shareContentUri. URI:', fileUri, 'mimeType:', mimeType);
          await MediaStoreModule.shareContentUri(fileUri, mimeType, file.fileName);
        } else {
          console.warn('[LocalFilesScreen] MediaStoreModule.shareContentUri not available, falling back to IntentLauncher');
          // Fallback to IntentLauncher
          // android.intent.action.SEND를 사용하여 공유
          // extra.STREAM에 content:// URI 전달하고 flags로 권한 부여
          console.log('[LocalFilesScreen] Sharing with IntentLauncher. URI:', fileUri, 'mimeType:', mimeType);
          await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
            type: mimeType,
            flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
            extra: {
              'android.intent.extra.STREAM': fileUri,
              'android.intent.extra.SUBJECT': file.fileName,
            },
          });
        }
      } else {
        Alert.alert(t.error || '오류', t.iosNotSupported || 'iOS에서는 지원되지 않는 기능입니다.');
      }
    } catch (error) {
      console.error('[LocalFilesScreen] Error sharing file:', error);
      // 사용자가 공유를 취소한 경우는 에러로 처리하지 않음
      if (error.message && !error.message.includes('User canceled') && !error.message.includes('No Activity found')) {
        Alert.alert(t.error || '오류', error.message || t.shareError || '공유할 수 없습니다.');
      }
    }
  };

  // 파일 삭제
  const handleDeleteFile = async (file) => {
    Alert.alert(
      t.deleteFileTitle || '삭제',
      t.deleteFileMessage?.replace('{name}', file.title) || `"${file.title}" 파일을 삭제하시겠습니까?`,
      [
        { text: t.cancel || '취소', style: 'cancel' },
        {
          text: t.delete || '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLocalFile(file.id);
              loadLocalFiles(true);
              Alert.alert(t.complete || '완료', t.fileDeleted || '파일이 삭제되었습니다.');
            } catch (error) {
              console.error('[LocalFilesScreen] Error deleting file:', error);
              Alert.alert(t.error || '오류', error.message || t.deleteFileError || '파일을 삭제할 수 없습니다.');
            }
          }
        }
      ]
    );
  };

  // 플레이리스트 관리
  const handlePlaylistCreate = async (playlistName) => {
    try {
      await createPlaylist(playlistName);
      await loadPlaylists();
      Alert.alert(t.complete || '완료', t.playlistGroupCreated || '플레이리스트가 생성되었습니다.');
    } catch (error) {
      console.error('[LocalFilesScreen] Error creating playlist:', error);
      Alert.alert(t.error || '오류', t.playlistGroupCreateError || '플레이리스트를 생성할 수 없습니다.');
    }
  };

  const handlePlaylistUpdate = async (playlistId, newPlaylistName) => {
    try {
      await updatePlaylist(playlistId, newPlaylistName);
      await loadPlaylists();
      await loadLocalFiles(true);
      Alert.alert(t.complete || '완료', t.playlistGroupRenamed || '플레이리스트 이름이 변경되었습니다.');
    } catch (error) {
      console.error('[LocalFilesScreen] Error updating playlist:', error);
      Alert.alert(t.error || '오류', t.playlistGroupRenameError || '플레이리스트 이름을 변경할 수 없습니다.');
    }
  };

  const handlePlaylistDelete = async (playlistId) => {
    try {
      await deletePlaylist(playlistId);
      if (playlistFilter === playlistId) {
        setPlaylistFilter(null);
      }
      await loadPlaylists();
      await loadLocalFiles(true);
      Alert.alert(t.complete || '완료', t.playlistGroupDeleted || '플레이리스트가 삭제되었습니다.');
    } catch (error) {
      console.error('[LocalFilesScreen] Error deleting playlist:', error);
      Alert.alert(t.error || '오류', t.playlistGroupDeleteError || '플레이리스트를 삭제할 수 없습니다.');
    }
  };

  const handlePlaylistToggle = (playlistId, isSelected) => {
    setSelectedPlaylistIds(prev => {
      if (isSelected) {
        return [...prev, playlistId];
      } else {
        return prev.filter(id => id !== playlistId);
      }
    });
  };

  const handlePlaylistSelect = async () => {
    if (!selectedFileForPlaylist) return;
    
    try {
      // 플레이리스트 목록을 먼저 새로고침 (새로 생성된 플레이리스트 포함)
      await loadPlaylists();
      
      // 최신 플레이리스트 목록을 다시 가져와서 사용
      const latestPlaylists = await getPlaylists();
      
      // 선택된 플레이리스트 ID로 플레이리스트 데이터 배열 생성
      const playlistDataArray = selectedPlaylistIds.map(playlistId => {
        const playlist = latestPlaylists.find(p => p.playlist_id === playlistId);
        if (!playlist) {
          // 플레이리스트를 찾을 수 없으면 데이터베이스에서 직접 조회
          console.warn('[LocalFilesScreen] Playlist not found in local state, ID:', playlistId);
          return null;
        }
        return {
          playlist_id: playlistId,
          playlist_name: playlist.playlist_name
        };
      }).filter(p => p !== null && p.playlist_name && p.playlist_name.trim() !== ''); // 유효한 것만 필터링
      
      if (playlistDataArray.length === 0) {
        // 선택된 플레이리스트가 없으면 기존 관계만 제거
        await assignFileToPlaylist(selectedFileForPlaylist.fileUri, []);
      } else {
        await assignFileToPlaylist(selectedFileForPlaylist.fileUri, playlistDataArray);
      }
      
      // 파일 목록 새로고침 (플레이리스트 정보 포함)
      await loadLocalFiles(true);
      await loadPlaylists();
      setSelectedFileForPlaylist(null);
      setSelectedPlaylistIds([]);
    } catch (error) {
      console.error('[LocalFilesScreen] Error assigning playlists:', error);
      Alert.alert(t.error || '오류', t.playlistGroupAssignError || '플레이리스트를 할당할 수 없습니다.');
    }
  };

  const handlePlaylistSelectorCreate = async (playlistName) => {
    if (!selectedFileForPlaylist) return;
    
    try {
      const playlistId = await createPlaylist(playlistName);
      setSelectedPlaylistIds(prev => [...prev, playlistId]);
      await loadPlaylists();
    } catch (error) {
      console.error('[LocalFilesScreen] Error creating playlist:', error);
      Alert.alert(t.error || '오류', t.playlistGroupCreateError || '플레이리스트를 생성할 수 없습니다.');
    }
  };

  // 더 많은 파일 로드
  const loadMoreFiles = useCallback(() => {
    console.log('[LocalFilesScreen] loadMoreFiles called:', {
      loadingMore,
      hasNextPage,
      endCursor: endCursorRef.current,
    });
    if (!loadingMore && hasNextPage) {
      setLoadingMore(true);
      loadLocalFiles(false);
    } else {
      console.log('[LocalFilesScreen] loadMoreFiles skipped:', {
        loadingMore,
        hasNextPage,
      });
    }
  }, [loadingMore, hasNextPage, loadLocalFiles]);

  // 데이터에 광고 삽입
  const getDataWithAds = () => {
    if (filteredFiles.length === 0) {
      return [];
    }
    
    const result = [];
    result.push(filteredFiles[0]);
    
    if (filteredFiles.length > 0) {
      result.push({ type: 'ad', id: 'ad-bottom' });
    }
    
    for (let i = 1; i < filteredFiles.length; i++) {
      result.push(filteredFiles[i]);
      if ((i - 1) % 3 === 2) {
        result.push({ type: 'ad', id: `ad-${i}` });
      }
    }
    
    return result;
  };

  // 파일 항목 렌더링
  const renderFileItem = ({ item }) => {
    if (item.type === 'ad') {
      return <AdBanner style={{ marginVertical: 10 }} />;
    }
    
    const fileSizeMB = (item.size / (1024 * 1024)).toFixed(2);
    
    return (
      <TouchableOpacity 
        style={styles.fileItem}
        activeOpacity={0.8}
      >
        {item.playlist_names && item.playlist_names.length > 0 && (
          <View style={styles.playlistBadgesContainer}>
            {item.playlist_names.map((playlistName, idx) => (
              <View key={idx} style={styles.playlistBadge}>
                <Ionicons name="list" size={12} color="#4CAF50" />
                <Text style={styles.playlistBadgeText}>{playlistName}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={styles.fileInfo}>
          <View style={styles.fileThumbnailContainer}>
            <View style={[styles.fileThumbnail, styles.fileThumbnailPlaceholder]}>
              <Ionicons 
                name={item.isVideo ? "videocam" : "musical-notes"} 
                size={24} 
                color={item.isVideo ? "#FF0000" : "#4CAF50"} 
              />
            </View>
          </View>
          <View style={styles.fileDetails}>
            <Text style={styles.fileName} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.fileSize}>
              {fileSizeMB} MB • {item.isVideo ? (t.video || '영상') : (t.music || '음악')}
            </Text>
          </View>
        </View>
        <View style={styles.fileActions}>
          <TouchableOpacity
            style={styles.playlistIconButton}
            onPress={(e) => {
              e.stopPropagation();
              setSelectedFileForPlaylist(item);
              setSelectedPlaylistIds(item.playlist_ids || []);
              setShowPlaylistSelector(true);
            }}
          >
            <Ionicons 
              name={(item.playlist_ids && item.playlist_ids.length > 0) ? "list" : "list-outline"} 
              size={20} 
              color={(item.playlist_ids && item.playlist_ids.length > 0) ? "#4CAF50" : "#999"} 
            />
          </TouchableOpacity>
          <View style={styles.actionButtonsGroup}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                handlePlayFile(item);
              }}
            >
              <Ionicons name="play" size={24} color={item.isVideo ? "#FF0000" : "#4CAF50"} />
              <Text style={styles.actionButtonText}>{t.play || '재생'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                handleShareFile(item);
              }}
            >
              <Ionicons name="share" size={24} color="#2196F3" />
              <Text style={styles.actionButtonText}>{t.share || '공유'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={(e) => {
                e.stopPropagation();
                handleDeleteFile(item);
              }}
            >
              <Ionicons name="trash" size={24} color="#f44336" />
              <Text style={[styles.actionButtonText, styles.deleteButtonText]}>{t.delete || '삭제'}</Text>
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
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.logoContainer}
            onPress={() => {
              navigation.navigate('VideoSearch');
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
            <Text style={styles.headerTitle}>MeTube</Text>
          </View>
          <TouchableOpacity
            style={styles.playlistButton}
            onPress={() => setShowPlaylistManager(true)}
          >
            <Ionicons 
              name="list" 
              size={24} 
              color="#fff" 
            />
          </TouchableOpacity>
          <LanguageSelector />
        </View>
      </SafeAreaView>

      {hasPermission !== null && (
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={t.searchFilesPlaceholder || '파일명으로 검색...'}
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setSearchQuery('')}
              >
                <Ionicons name="close-circle" size={20} color="#999" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.filterToggleButton}
              onPress={() => setShowFilters(!showFilters)}
            >
              <Ionicons 
                name={showFilters ? "options" : "options-outline"} 
                size={20} 
                color="#666" 
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 플레이리스트 필터 버튼 */}
      {showFilters && !loading && (() => {
        // 실제로 파일이 있는 플레이리스트만 필터링
        const playlistsWithFiles = playlists.filter(playlist => {
          return localFiles.some(file => {
            const playlistIds = file.playlist_ids || [];
            return playlistIds.includes(playlist.playlist_id);
          });
        });
        
        if (playlistsWithFiles.length === 0) return null;
        
        return (
          <View style={styles.filterSection}>
            <TouchableOpacity
              style={[
                styles.playlistFilterButton,
                playlistFilter === null && styles.filterButtonActive
              ]}
              onPress={() => setPlaylistFilter(null)}
            >
              <Text style={[
                styles.filterButtonText,
                playlistFilter === null && styles.filterButtonTextActive
              ]}>
                {t.all || '전체'}
              </Text>
            </TouchableOpacity>
            {playlistsWithFiles.map((playlist) => (
              <TouchableOpacity
                key={playlist.playlist_id}
                style={[
                  styles.playlistFilterButton,
                  playlistFilter === playlist.playlist_id && styles.filterButtonActive
                ]}
                onPress={() => setPlaylistFilter(playlist.playlist_id)}
              >
                <Ionicons 
                  name="list" 
                  size={14} 
                  color={playlistFilter === playlist.playlist_id ? '#fff' : '#666'} 
                  style={{ marginRight: 4 }}
                />
                <Text 
                  style={[
                    styles.filterButtonText,
                    playlistFilter === playlist.playlist_id && styles.filterButtonTextActive
                  ]} 
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {playlist.playlist_name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      })()}

      {/* 파일 타입 필터 버튼 */}
      {showFilters && !loading && (
        <View style={styles.filterSection}>
          <TouchableOpacity
            style={[
              styles.filterButton,
              fileTypeFilter === 'all' && styles.filterButtonActive
            ]}
            onPress={() => setFileTypeFilter('all')}
          >
            <Text style={[
              styles.filterButtonText,
              fileTypeFilter === 'all' && styles.filterButtonTextActive
            ]}>
              {t.all || '전체'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              fileTypeFilter === 'video' && styles.filterButtonActive
            ]}
            onPress={() => setFileTypeFilter('video')}
          >
            <Ionicons 
              name="videocam" 
              size={14} 
              color={fileTypeFilter === 'video' ? '#fff' : '#666'} 
              style={{ marginRight: 4 }}
            />
            <Text style={[
              styles.filterButtonText,
              fileTypeFilter === 'video' && styles.filterButtonTextActive
            ]}>
              {t.video || '영상'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              fileTypeFilter === 'audio' && styles.filterButtonActive
            ]}
            onPress={() => setFileTypeFilter('audio')}
          >
            <Ionicons 
              name="musical-notes" 
              size={14} 
              color={fileTypeFilter === 'audio' ? '#fff' : '#666'} 
              style={{ marginRight: 4 }}
            />
            <Text style={[
              styles.filterButtonText,
              fileTypeFilter === 'audio' && styles.filterButtonTextActive
            ]}>
              {t.music || '음악'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 정렬 버튼 */}
      {showFilters && !loading && (
        <View style={styles.sortSection}>
          <TouchableOpacity
            style={[
              styles.sortButton,
              (sortBy === 'date-desc' || sortBy === 'date-asc') && styles.sortButtonActive
            ]}
            onPress={() => {
              if (sortBy === 'date-desc') {
                setSortBy('date-asc');
              } else if (sortBy === 'date-asc') {
                setSortBy('date-desc');
              } else {
                setSortBy('date-desc');
              }
            }}
          >
            <Ionicons 
              name={sortBy === 'date-asc' ? 'arrow-up' : 'arrow-down'} 
              size={12} 
              color={(sortBy === 'date-desc' || sortBy === 'date-asc') ? '#fff' : '#666'} 
              style={{ marginRight: 4 }}
            />
            <Text style={[
              styles.sortButtonText,
              (sortBy === 'date-desc' || sortBy === 'date-asc') && styles.sortButtonTextActive
            ]}>
              {sortBy === 'date-desc' ? (t.newest || '최신순') : sortBy === 'date-asc' ? (t.oldest || '오래된순') : (t.newest || '최신순')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sortButton,
              (sortBy === 'title-asc' || sortBy === 'title-desc') && styles.sortButtonActive
            ]}
            onPress={() => {
              if (sortBy === 'title-asc') {
                setSortBy('title-desc');
              } else if (sortBy === 'title-desc') {
                setSortBy('title-asc');
              } else {
                setSortBy('title-asc');
              }
            }}
          >
            <Ionicons 
              name={sortBy === 'title-desc' ? 'arrow-down' : 'arrow-up'} 
              size={12} 
              color={(sortBy === 'title-asc' || sortBy === 'title-desc') ? '#fff' : '#666'} 
              style={{ marginRight: 4 }}
            />
            <Text style={[
              styles.sortButtonText,
              (sortBy === 'title-asc' || sortBy === 'title-desc') && styles.sortButtonTextActive
            ]}>
              {t.titleSort || '제목순'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ✅ 음악 전체재생 버튼 (음악 필터일 때만 표시) */}
      {fileTypeFilter === 'audio' && filteredFiles.filter(f => !f.isVideo).length > 0 && (
        <View style={styles.playAllSection}>
          <TouchableOpacity
            style={styles.playAllButton}
            onPress={handlePlayAll}
          >
            {playlistFilter ? (
              <View style={styles.playAllButtonInner}>
                <Ionicons 
                  name={isPlaying && playingPlaylistFilter === playlistFilter ? "pause-circle" : "play-circle"} 
                  size={24} 
                  color="#fff" 
                  style={{ flexShrink: 0 }}
                />
                <Text style={styles.playAllButtonText}>
                  {(() => {
                    const selectedPlaylist = playlists.find(p => p.playlist_id === playlistFilter);
                    const playlistPrefix = selectedPlaylist ? `${selectedPlaylist.playlist_name} ` : '';
                    
                    if (isPlaying && playingPlaylistFilter === playlistFilter) {
                      return `${playlistPrefix}${t.playing || '재생 중'} (${currentIndex + 1}/${playlist.length})`;
                    } else {
                      return `${playlistPrefix}${t.playFromStart || '처음부터 재생'} (${filteredFiles.filter(f => !f.isVideo).length}${t.songs || '곡'})`;
                    }
                  })()}
                </Text>
              </View>
            ) : (
              <>
                <Ionicons 
                  name={isPlaying && playingPlaylistFilter === playlistFilter ? "pause-circle" : "play-circle"} 
                  size={24} 
                  color="#fff" 
                />
                <Text style={styles.playAllButtonText}>
                  {isPlaying && playingPlaylistFilter === playlistFilter
                    ? `${t.playing || '재생 중'} (${currentIndex + 1}/${playlist.length})` 
                    : `${t.playFromStart || '처음부터 재생'} (${filteredFiles.filter(f => !f.isVideo).length}${t.songs || '곡'})`
                  }
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
      
      {/* ✅ 전체 필터일 때 음악 전체재생 버튼 표시 */}
      {fileTypeFilter === 'all' && filteredFiles.filter(f => !f.isVideo).length > 0 && (
        <View style={styles.playAllSection}>
          <TouchableOpacity
            style={styles.playAllButton}
            onPress={handlePlayAll}
          >
            {playlistFilter ? (
              <View style={styles.playAllButtonInner}>
                <Ionicons 
                  name={isPlaying && playingPlaylistFilter === playlistFilter ? "pause-circle" : "play-circle"} 
                  size={24} 
                  color="#fff" 
                  style={{ flexShrink: 0 }}
                />
                <Text style={styles.playAllButtonText}>
                  {(() => {
                    const selectedPlaylist = playlists.find(p => p.playlist_id === playlistFilter);
                    const playlistPrefix = selectedPlaylist ? `${selectedPlaylist.playlist_name} ` : '';
                    
                    if (isPlaying && playingPlaylistFilter === playlistFilter) {
                      return `${playlistPrefix}${t.playing || '재생 중'} (${currentIndex + 1}/${playlist.length})`;
                    } else {
                      return `${playlistPrefix}${t.playFromStart || '처음부터 재생'} (${filteredFiles.filter(f => !f.isVideo).length}${t.songs || '곡'})`;
                    }
                  })()}
                </Text>
              </View>
            ) : (
              <>
                <Ionicons 
                  name={isPlaying && playingPlaylistFilter === playlistFilter ? "pause-circle" : "play-circle"} 
                  size={24} 
                  color="#fff" 
                />
                <Text style={styles.playAllButtonText}>
                  {isPlaying && playingPlaylistFilter === playlistFilter
                    ? `${t.playing || '재생 중'} (${currentIndex + 1}/${playlist.length})` 
                    : `${t.playFromStart || '처음부터 재생'} (${filteredFiles.filter(f => !f.isVideo).length}${t.songs || '곡'})`
                  }
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {hasPermission === null ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FF0000" />
          <Text style={styles.loadingText}>권한 확인 중...</Text>
        </View>
      ) : hasPermission === false ? (
        <View style={styles.centerContainer}>
          <Ionicons name="lock-closed" size={64} color="#999" />
          <Text style={styles.emptyText}>
            {t.permissionRequired || '미디어 파일에 접근하려면 권한이 필요합니다.'}
          </Text>
          <Text style={styles.emptySubText}>
            {t.permissionDescription || '기기의 음악 및 영상 파일을 보려면 저장소 권한을 허용해주세요.'}
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
          >
            <Ionicons name="lock-open" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.permissionButtonText}>
              {t.requestPermission || '권한 요청'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : loading && localFiles.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FF0000" />
          <Text style={styles.loadingText}>{t.loadingFiles || '파일을 불러오는 중...'}</Text>
        </View>
      ) : (
        <FlatList
          data={getDataWithAds()}
          renderItem={renderFileItem}
          keyExtractor={(item, index) => item.type === 'ad' ? item.id : (item.fileUri || `file-${index}`)}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Ionicons name="folder-outline" size={64} color="#ddd" />
              <Text style={styles.emptyText}>
                {searchQuery 
                  ? (t.noSearchResults || '검색 결과가 없습니다')
                  : fileTypeFilter === 'video' 
                    ? (t.noLocalVideos || '로컬 영상 파일이 없습니다')
                    : fileTypeFilter === 'audio'
                      ? (t.noLocalMusic || '로컬 음악 파일이 없습니다')
                      : (t.noLocalFiles || '로컬 파일이 없습니다')
                }
              </Text>
            </View>
          }
          contentContainerStyle={filteredFiles.length === 0 ? styles.listContentEmpty : styles.listContent}
          onEndReached={loadMoreFiles}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color="#FF0000" />
              </View>
            ) : null
          }
        />
      )}

      {playlist.length > 0 && (
        <MiniPlayer
          isVisible={true}
          isPlaying={isPlaying}
          currentItem={playlist[currentIndex]}
          currentIndex={currentIndex}
          totalItems={playlist.length}
          onPlayPause={handlePlayPause}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onClose={handleStopPlaylist}
        />
      )}

      <PinManagerModal
        visible={showPlaylistManager}
        onClose={() => setShowPlaylistManager(false)}
        pins={playlists.map(p => ({ pin_id: p.playlist_id, pin_name: p.playlist_name }))}
        onPinCreate={handlePlaylistCreate}
        onPinUpdate={handlePlaylistUpdate}
        onPinDelete={handlePlaylistDelete}
        labelType="playlist"
        files={localFiles}
      />

      <PinSelectorModal
        visible={showPlaylistSelector}
        onClose={async () => {
          await handlePlaylistSelect();
          setShowPlaylistSelector(false);
          setSelectedFileForPlaylist(null);
          setSelectedPlaylistIds([]);
        }}
        pins={playlists.map(p => ({ pin_id: p.playlist_id, pin_name: p.playlist_name }))}
        currentPinIds={selectedPlaylistIds}
        onPinSelect={handlePlaylistToggle}
        onPinCreate={handlePlaylistSelectorCreate}
        onPinUpdate={handlePlaylistUpdate}
        labelType="playlist"
      />
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
    width: 44,
    height: 44,
    overflow: 'hidden',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 56,
    height: 56,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: 'bold',
  },
  playlistButton: {
    marginRight: 8,
    padding: 4,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchSection: {
    padding: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  filterToggleButton: {
    marginLeft: 8,
    padding: 4,
  },
  filterSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flex: 1,
  },
  filterButtonActive: {
    backgroundColor: '#ff6b6b',
    borderColor: '#ff6b6b',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  filterButtonDisabled: {
    opacity: 0.5,
  },
  filterButtonTextDisabled: {
    color: '#ccc',
  },
  playlistFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sortSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 8,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flex: 1,
  },
  sortButtonActive: {
    backgroundColor: '#ff6b6b',
    borderColor: '#ff6b6b',
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  sortButtonTextActive: {
    color: '#fff',
  },
  playAllSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  playAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
  },
  playAllButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    flexWrap: 'wrap',
  },
  playAllButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
    flexShrink: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  emptySubText: {
    marginTop: 8,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  permissionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    marginTop: 24,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 16,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  fileItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  playlistBadgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
    gap: 4,
  },
  playlistBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 4,
  },
  playlistBadgeText: {
    fontSize: 10,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  fileThumbnailContainer: {
    marginRight: 12,
    position: 'relative',
  },
  fileThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileThumbnailPlaceholder: {
    backgroundColor: '#e0e0e0',
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 12,
    color: '#999',
  },
  fileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playlistIconButton: {
    padding: 8,
    marginRight: 8,
  },
  actionButtonsGroup: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
  },
  actionButton: {
    alignItems: 'center',
    padding: 8,
    minWidth: 60,
  },
  actionButtonText: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
  },
  deleteButton: {
    // 삭제 버튼 스타일
  },
  deleteButtonText: {
    color: '#f44336',
  },
  footerLoader: {
    padding: 16,
    alignItems: 'center',
  },
});

