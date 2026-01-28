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
  Linking,
  Alert,
  InteractionManager,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import AdBanner from '../components/AdBanner';
import MiniPlayer from '../components/MiniPlayer';
import LanguageSelector from '../components/LanguageSelector';
import PinManagerModal from '../components/PinManagerModal';
import PinSelectorModal from '../components/PinSelectorModal';
import { getDownloadedFiles, deleteFileWithMetadata, getThumbnailCachePath } from '../services/downloadService';
import { shareDownloadedFile, saveFileToDevice } from '../services/downloadService';
import { getPlaylists, createPlaylist, updatePlaylist, deletePlaylist, assignFileToPlaylist, getPlaylistsForFile } from '../services/playlistService';
import MediaStoreModule from '../modules/MediaStoreModule';
import mediaSessionService from '../services/mediaSessionService';
import AudioPlaybackService from '../modules/AudioPlaybackService';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../locales/translations';

/** [테스트] true면 MediaSession/알림 통째로 비활성화 — 원인 격리 후 false로 원복 */
const MEDIA_SESSION_DISABLED = false;

/** 백그라운드·잠금화면 재생용 오디오 모드 (세션 복구·포커스 재요청에 사용) */
const getAudioModeConfig = () => ({
  allowsRecordingIOS: false,
  staysActiveInBackground: true,
  playsInSilentModeIOS: true,
  shouldDuckAndroid: true,
  interruptionModeIOS: InterruptionModeIOS.DuckOthers,
  interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
  playThroughEarpieceAndroid: false,
});

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

export default function DownloadsScreen({ navigation }) {
  const { currentLanguage } = useLanguage();
  const t = translations[currentLanguage];
  const [downloadedFiles, setDownloadedFiles] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('all'); // ✅ 'all' | 'video' | 'audio'
  const [sortBy, setSortBy] = useState('date-desc'); // 'date-desc' | 'date-asc' | 'title-asc' | 'title-desc' | null
  const [showFilters, setShowFilters] = useState(false); // 필터/정렬 섹션 표시 여부
  const [thumbnailCachePaths, setThumbnailCachePaths] = useState({}); // videoId -> cache path
  const [playlistFilter, setPlaylistFilter] = useState(null); // null: 전체, playlist_id: 특정 플레이리스트
  const [playlists, setPlaylists] = useState([]); // 플레이리스트 그룹 목록
  const [showPlaylistManager, setShowPlaylistManager] = useState(false); // 플레이리스트 관리 모달 표시 여부
  const [showPlaylistSelector, setShowPlaylistSelector] = useState(false); // 플레이리스트 선택 모달 표시 여부
  const [selectedFileForPlaylist, setSelectedFileForPlaylist] = useState(null); // 플레이리스트에 추가할 파일
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState([]); // 선택된 플레이리스트 ID 목록
  
  // ✅ 음악 전체재생 관련 상태
  const [playlist, setPlaylist] = useState([]); // 재생할 음악 파일 목록
  const [currentIndex, setCurrentIndex] = useState(0); // 현재 재생 중인 인덱스
  const [isPlaying, setIsPlaying] = useState(false); // 재생 중 여부
  const [sound, setSound] = useState(null); // expo-av Sound 객체
  const soundRef = useRef(null); // sound 객체 참조
  const prevPlaylistFilterRef = useRef(null); // 이전 playlistFilter 값 저장
  const [playingPlaylistFilter, setPlayingPlaylistFilter] = useState(null); // 재생 시작 시의 playlistFilter 저장
  const playlistRef = useRef([]); // 플레이리스트 ref (백그라운드에서도 접근 가능)
  const currentIndexRef = useRef(0); // currentIndex ref
  const isPlayingRef = useRef(false); // 재생 중인지 확인하는 ref (race condition 방지)
  const lastNotificationUpdateRef = useRef(0); // 마지막 알림 업데이트 시간 (throttling)
  const isSeekingRef = useRef(false); // seek 중인지 확인하는 ref (seek 중에는 setOnPlaybackStatusUpdate 무시)

  // 플레이리스트 목록 로드
  const loadPlaylists = useCallback(async () => {
    try {
      const playlistsList = await getPlaylists();
      setPlaylists(playlistsList);
    } catch (error) {
      console.error('[DownloadsScreen] Error loading playlists:', error);
    }
  }, []);

  // 다운로드한 파일 목록 로드
  const loadDownloadedFiles = useCallback(async () => {
    try {
      setLoading(true);
      const files = await getDownloadedFiles();
      
      // 각 파일의 플레이리스트 정보 로드
      const filesWithPlaylists = await Promise.all(
        files.map(async (file) => {
          const filePlaylists = await getPlaylistsForFile(file.fileUri);
          return {
            ...file,
            playlist_ids: filePlaylists.map(p => p.playlist_id),
            playlist_names: filePlaylists.map(p => p.playlist_name),
          };
        })
      );
      
      setDownloadedFiles(filesWithPlaylists);
      console.log('[DownloadsScreen] Loaded downloaded files:', filesWithPlaylists.length);
      
      // ✅ 썸네일 캐시 경로 로드
      const cachePaths = {};
      for (const file of filesWithPlaylists) {
        if (file.videoId) {
          const cachePath = await getThumbnailCachePath(file.videoId);
          if (cachePath) {
            cachePaths[file.videoId] = cachePath;
          }
        }
      }
      setThumbnailCachePaths(cachePaths);
    } catch (error) {
      console.error('[DownloadsScreen] Error loading downloaded files:', error);
      Alert.alert(t.error, t.loadFilesError);
    } finally {
      setLoading(false);
    }
  }, []);

  // ✅ 검색, 타입 필터링 및 정렬
  useEffect(() => {
    let filtered = [...downloadedFiles];
    
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
        filtered = [...downloadedFiles];
        // 파일 타입 필터는 유지
        if (fileTypeFilter === 'video') {
          filtered = filtered.filter(file => file.isVideo);
        } else if (fileTypeFilter === 'audio') {
          filtered = filtered.filter(file => !file.isVideo);
        }
      }
    }
    // playlistFilter === null이면 전체 표시
    
    // 검색 필터링
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
  }, [searchQuery, downloadedFiles, fileTypeFilter, sortBy, playlistFilter]);

  // ✅ 음악 전체재생 시작
  const handlePlayAll = async () => {
    try {
      // 재생 중이고, 현재 필터가 재생 시작 시의 필터와 일치할 때만 일시정지/재생 토글
      if (isPlaying && playlist.length > 0 && playingPlaylistFilter === playlistFilter) {
        await handlePlayPause();
        return;
      }

      const audioFiles = filteredFiles.filter(file => !file.isVideo);
      if (audioFiles.length === 0) {
        Alert.alert(t.notice, t.noMusicFiles);
        return;
      }

      // 기존 재생 중지 (다른 필터에서 재생 중이거나 새로 시작하는 경우)
      if (soundRef.current) {
        try {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
        } catch (e) { /* 이미 정리된 경우 등 */ }
        soundRef.current = null;
      }

      setPlaylist(audioFiles);
      playlistRef.current = audioFiles; // ref에도 저장
      setCurrentIndex(0);
      currentIndexRef.current = 0; // ref에도 저장
      setPlayingPlaylistFilter(playlistFilter); // 재생 시작 시의 필터 저장
      
      // AsyncStorage에 저장
      try {
        await AsyncStorage.setItem('currentPlaylist', JSON.stringify(audioFiles.map(f => ({
          fileUri: f.fileUri,
          title: f.title,
          fileName: f.fileName,
          author: f.author,
          thumbnail: f.thumbnail,
          id: f.id,
        }))));
        await AsyncStorage.setItem('currentIndex', '0');
      } catch (error) {
        console.error('[DownloadsScreen] Error saving playlist to AsyncStorage:', error);
      }
      
      await playAudioFile(audioFiles[0], 0);
    } catch (error) {
      console.error('[DownloadsScreen] Error starting playlist:', error);
      Alert.alert(t.error, t.playMusicError);
    }
  };

  // ✅ 오디오 파일 재생
  const playAudioFile = async (file, index) => {
    const previousFileIndex = currentIndex;
    const previousFile = playlist[previousFileIndex];
    
    console.log('[DownloadsScreen] playAudioFile called for:', file.title, 'at index:', index);
    
    try {
      // Foreground Service를 먼저 시작 (createAsync 전에 띄워서 백그라운드에서 죽지 않도록)
      AudioPlaybackService.start(file.title || file.fileName, file.author);
      
      // 백그라운드 오디오 재생 활성화 (재생 시작 전 확인)
      await Audio.setAudioModeAsync(getAudioModeConfig());

      if (!MEDIA_SESSION_DISABLED) await mediaSessionService.ensureInitialized();

      // 파일 존재 확인
      const fileInfo = await FileSystem.getInfoAsync(file.fileUri);
      if (!fileInfo.exists) {
        console.error('[DownloadsScreen] File not found:', file.fileUri);
        Alert.alert(t.error, t.fileNotFoundWithName.replace('{name}', file.title));
        if (!MEDIA_SESSION_DISABLED && previousFile) {
          console.log('[DownloadsScreen] Maintaining previous file notification (file not found)');
          await mediaSessionService.updateMetadata({
            id: previousFile.id || previousFileIndex,
            title: previousFile.title || previousFile.fileName,
            author: previousFile.author || '',
            thumbnail: previousFile.thumbnail || null,
          });
          await mediaSessionService.updatePlaybackState(isPlaying, true, true, null, null, false);
        }
        throw new Error('File not found');
      }

      isPlayingRef.current = true;

      // 무음의 틈 직후: OS에 "곧 새 소리 낼 거야" 리마인드 (유령 재생 방지)
      await Audio.setAudioModeAsync(getAudioModeConfig());

      // 새 곡 먼저 로드 (unload/load 공백 최소화 — OS가 세션 닫는 틈 막기)
      const isAudioFocusError = (e) =>
        (e?.message && String(e.message).includes('AudioFocusNotAcquiredException')) ||
        (e?.message && String(e.message).includes('Audio focus could not be acquired'));

      let newSound = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 450));
            await Audio.setAudioModeAsync(getAudioModeConfig());
            console.log('[DownloadsScreen] Retrying after AudioFocusNotAcquiredException...');
          }
          console.log('[DownloadsScreen] Loading new sound from:', file.fileUri, attempt > 0 ? '(retry)' : '');
          const result = await Audio.Sound.createAsync(
            { uri: file.fileUri },
            { shouldPlay: true, volume: 1.0 }
          );
          newSound = result.sound;
          await newSound.playAsync();
          console.log('[DownloadsScreen] createAsync+playAsync 완료, index:', index);
          break;
        } catch (e) {
          if (newSound) {
            try { await newSound.unloadAsync(); } catch (_) {}
            newSound = null;
          }
          if (isAudioFocusError(e) && attempt === 0) {
            console.warn('[DownloadsScreen] AudioFocusNotAcquiredException, retrying in 450ms...', e?.message);
            continue;
          }
          throw e;
        }
      }
      if (!newSound) throw new Error('Failed to create sound');

      // 이전 곡 해제 (새 곡 로드 후 unload — 공백 최소화)
      if (soundRef.current) {
        try {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
          console.log('[DownloadsScreen] Stopped previous playback for track change');
        } catch (unloadError) {
          console.warn('[DownloadsScreen] Error stopping/unloading previous sound:', unloadError);
        }
        soundRef.current = null;
      }

      // 성공적으로 로드된 후에만 상태 업데이트
      soundRef.current = newSound;
      setSound(newSound);
      setIsPlaying(true);
      setCurrentIndex(index);
      currentIndexRef.current = index; // ref에도 저장
      
      // 플레이리스트와 인덱스를 AsyncStorage에 저장 (잠금화면에서 버튼 작동을 위해 필수)
      const currentPlaylistForSave = playlistRef.current.length > 0 ? playlistRef.current : playlist;
      try {
        await AsyncStorage.setItem('currentIndex', index.toString());
        // 플레이리스트도 저장 (fileUri만 저장하여 파일이 삭제되어도 복원 가능)
        await AsyncStorage.setItem('currentPlaylist', JSON.stringify(currentPlaylistForSave.map(f => ({
          fileUri: f.fileUri,
          title: f.title,
          fileName: f.fileName,
          author: f.author,
          thumbnail: f.thumbnail,
          videoId: f.videoId,
          id: f.id
        }))));
        console.log('[DownloadsScreen] Saved playlist and index to AsyncStorage');
      } catch (error) {
        console.error('[DownloadsScreen] Error saving currentIndex/currentPlaylist to AsyncStorage:', error);
      }

      // duration 얻기 (트랙바 표시를 위해 필요)
      const status = await newSound.getStatusAsync();
      const duration = status.isLoaded ? status.durationMillis : null;

      // MediaSession 메타데이터 및 알림 업데이트
      const currentPlaylistForUpdate = playlistRef.current.length > 0 ? playlistRef.current : playlist;
      const canGoNext = index < currentPlaylistForUpdate.length - 1;
      const canGoPrevious = index > 0;

      if (!MEDIA_SESSION_DISABLED) {
        await mediaSessionService.updateMetadata({
          id: file.id || index,
          title: file.title || file.fileName,
          author: file.author || '',
          thumbnail: file.thumbnail || null,
        }, duration);
        const initialPosition = status.isLoaded ? status.positionMillis || 0 : 0;
        await mediaSessionService.updatePlaybackState(true, canGoNext, canGoPrevious, initialPosition, duration, true);
      }

      newSound.setOnPlaybackStatusUpdate(async (status) => {
        if (!MEDIA_SESSION_DISABLED) {
          if (isSeekingRef.current || !status.isLoaded) return;
          const position = status.positionMillis || 0;
          const duration = status.durationMillis || 0;
          if (position === 0 && !status.isPlaying && duration > 0) return;
          const now = Date.now();
          if (now - lastNotificationUpdateRef.current >= 200) {
            const currentPlaylist = playlistRef.current.length > 0 ? playlistRef.current : playlist;
            const canGoNext = index < currentPlaylist.length - 1;
            const canGoPrevious = index > 0;
            await mediaSessionService.updatePlaybackState(status.isPlaying, canGoNext, canGoPrevious, position, duration);
            lastNotificationUpdateRef.current = now;
          }
        }
        if (status.isPlaying && isPlayingRef.current) {
          isPlayingRef.current = false;
        }
        if (status.didJustFinish && !status.isLooping) {
          console.log('[DownloadsScreen] didJustFinish → handleNext (즉시)');
          handleNext();
        }
      });
    } catch (error) {
      isPlayingRef.current = false;
      console.error('[DownloadsScreen] Error playing audio:', error);
      if (!MEDIA_SESSION_DISABLED && previousFile) {
        try {
          const previousPlaylist = playlistRef.current.length > 0 ? playlistRef.current : playlist;
          const canGoNext = previousFileIndex < previousPlaylist.length - 1;
          const canGoPrevious = previousFileIndex > 0;
          await mediaSessionService.updateMetadata({ id: previousFile.id || previousFileIndex, title: previousFile.title || previousFile.fileName, author: previousFile.author || '', thumbnail: previousFile.thumbnail || null });
          await mediaSessionService.updatePlaybackState(isPlaying, canGoNext, canGoPrevious, null, null, false);
        } catch (updateError) {
          console.error('[DownloadsScreen] Error maintaining notification after play error:', updateError);
        }
      }
      throw error;
    }
  };

  // ✅ 재생
  const handlePlay = async () => {
    console.log('[DownloadsScreen] handlePlay called');
    try {
      if (!soundRef.current) {
        console.warn('[DownloadsScreen] soundRef.current is null, cannot play');
        return;
      }

      // 오디오 포커스·세션 재요청 (소리 없는 재생 복구용)
      await Audio.setAudioModeAsync(getAudioModeConfig());

      // 실제 오디오 상태 확인 (참고용 로그)
      const status = await soundRef.current.getStatusAsync();
      if (status.isPlaying) {
        console.log('[DownloadsScreen] Native reports already playing; calling playAsync anyway (silent-playback recovery)');
      }

      await soundRef.current.playAsync();
      setIsPlaying(true);
      console.log('[DownloadsScreen] Played successfully');

      // MediaSession 상태 업데이트 (재생/일시정지 토글 시에는 메타데이터 변경 없음)
      const currentPlaylistForPause = playlistRef.current.length > 0 ? playlistRef.current : playlist;
      const currentFileIndexForPause = currentIndexRef.current >= 0 ? currentIndexRef.current : currentIndex;
      
      if (!MEDIA_SESSION_DISABLED && currentPlaylistForPause[currentFileIndexForPause]) {
        const canGoNext = currentFileIndexForPause < currentPlaylistForPause.length - 1;
        const canGoPrevious = currentFileIndexForPause > 0;
        const currentStatus = await soundRef.current.getStatusAsync();
        const position = currentStatus.isLoaded ? currentStatus.positionMillis || 0 : 0;
        const duration = currentStatus.isLoaded ? currentStatus.durationMillis || 0 : 0;
        await mediaSessionService.updatePlaybackState(true, canGoNext, canGoPrevious, position, duration, true);
      }
    } catch (error) {
      console.error('[DownloadsScreen] Error playing:', error);
    }
  };

  // ✅ 일시정지
  const handlePause = async () => {
    console.log('[DownloadsScreen] handlePause called');
    try {
      if (!soundRef.current) {
        console.warn('[DownloadsScreen] soundRef.current is null, cannot pause');
        return;
      }

      await Audio.setAudioModeAsync(getAudioModeConfig());

      const status = await soundRef.current.getStatusAsync();
      if (!status.isPlaying) {
        console.log('[DownloadsScreen] Already paused, skipping');
        return;
      }

      await soundRef.current.pauseAsync();
      setIsPlaying(false);
      console.log('[DownloadsScreen] Paused successfully');

      const currentPlaylistForPause = playlistRef.current.length > 0 ? playlistRef.current : playlist;
      const currentFileIndexForPause = currentIndexRef.current >= 0 ? currentIndexRef.current : currentIndex;
      if (!MEDIA_SESSION_DISABLED && currentPlaylistForPause[currentFileIndexForPause]) {
        const canGoNext = currentFileIndexForPause < currentPlaylistForPause.length - 1;
        const canGoPrevious = currentFileIndexForPause > 0;
        const currentStatus = await soundRef.current.getStatusAsync();
        const position = currentStatus.isLoaded ? currentStatus.positionMillis || 0 : 0;
        const duration = currentStatus.isLoaded ? currentStatus.durationMillis || 0 : 0;
        await mediaSessionService.updatePlaybackState(false, canGoNext, canGoPrevious, position, duration, true);
      }
    } catch (error) {
      console.error('[DownloadsScreen] Error pausing:', error);
    }
  };

  // ✅ 재생/일시정지 (토글)
  const handlePlayPause = async () => {
    console.log('[DownloadsScreen] handlePlayPause called, current isPlaying:', isPlaying);
    try {
      if (!soundRef.current) {
        console.warn('[DownloadsScreen] soundRef.current is null, cannot play/pause');
        return;
      }

      // 실제 오디오 상태 확인
      const status = await soundRef.current.getStatusAsync();
      const actualIsPlaying = status.isPlaying;
      
      console.log('[DownloadsScreen] Actual playback state:', actualIsPlaying, 'UI state:', isPlaying);
      
      if (actualIsPlaying) {
        await handlePause();
      } else {
        await handlePlay();
      }
    } catch (error) {
      console.error('[DownloadsScreen] Error toggling play/pause:', error);
    }
  };

  // ✅ 다음 곡
  const handleNext = async () => {
    // ref에서 최신 값 가져오기 (백그라운드에서도 접근 가능)
    const currentPlaylist = playlistRef.current.length > 0 ? playlistRef.current : playlist;
    const currentFileIndex = currentIndexRef.current >= 0 ? currentIndexRef.current : currentIndex;
    const currentFile = currentPlaylist[currentFileIndex];
    
    console.log('[DownloadsScreen] handleNext called, currentIndex:', currentFileIndex, 'playlist.length:', currentPlaylist.length, 'playlistRef.length:', playlistRef.current.length);
    
    // 플레이리스트가 비어있으면 복원 시도
    if (currentPlaylist.length === 0) {
      console.log('[DownloadsScreen] Playlist is empty, attempting to restore from AsyncStorage');
      try {
        // downloadedFiles가 비어있으면 먼저 로드 (잠금화면에서 들어올 때 필요)
        let filesToUse = downloadedFiles;
        if (filesToUse.length === 0) {
          console.log('[DownloadsScreen] downloadedFiles is empty, loading files...');
          // getDownloadedFiles를 직접 호출하여 즉시 사용 가능한 파일 목록 가져오기
          const files = await getDownloadedFiles();
          // 플레이리스트 정보도 함께 로드
          const filesWithPlaylists = await Promise.all(
            files.map(async (file) => {
              const filePlaylists = await getPlaylistsForFile(file.fileUri);
              return {
                ...file,
                playlist_ids: filePlaylists.map(p => p.playlist_id),
                playlist_names: filePlaylists.map(p => p.playlist_name),
              };
            })
          );
          filesToUse = filesWithPlaylists;
        }
        
        const savedPlaylist = await AsyncStorage.getItem('currentPlaylist');
        const savedIndex = await AsyncStorage.getItem('currentIndex');
        
        if (savedPlaylist) {
          const parsedPlaylist = JSON.parse(savedPlaylist);
          // 다운로드한 파일 목록에서 매칭되는 파일 찾기
          const restoredPlaylist = parsedPlaylist.map(savedFile => {
            return filesToUse.find(file => file.fileUri === savedFile.fileUri) || savedFile;
          }).filter(file => file != null);
          
          if (restoredPlaylist.length > 0) {
            console.log('[DownloadsScreen] Restored playlist from AsyncStorage, length:', restoredPlaylist.length);
            setPlaylist(restoredPlaylist);
            playlistRef.current = restoredPlaylist;
            
            const restoredIndex = savedIndex ? parseInt(savedIndex, 10) : 0;
            if (restoredIndex >= 0 && restoredIndex < restoredPlaylist.length) {
              setCurrentIndex(restoredIndex);
              currentIndexRef.current = restoredIndex;
              
              // 복원된 곡 재생
              await playAudioFile(restoredPlaylist[restoredIndex], restoredIndex);
              return;
            }
          }
        }
      } catch (error) {
        console.error('[DownloadsScreen] Error restoring playlist from AsyncStorage:', error);
      }
      
      if (!MEDIA_SESSION_DISABLED && currentFile) {
        console.log('[DownloadsScreen] Failed to restore, maintaining current file notification');
        await mediaSessionService.updateMetadata({
          id: currentFile.id || currentFileIndex,
          title: currentFile.title || currentFile.fileName,
          author: currentFile.author || '',
          thumbnail: currentFile.thumbnail || null,
        });
        await mediaSessionService.updatePlaybackState(isPlaying);
      }
      return;
    }
    
    try {
      if (currentFileIndex < currentPlaylist.length - 1) {
        const nextIndex = currentFileIndex + 1;
        const nextFile = currentPlaylist[nextIndex];
        console.log('[DownloadsScreen] Attempting to play next file at index:', nextIndex);
        
        if (nextFile) {
          // playAudioFile이 실패해도 알림은 유지되도록 try-catch
          try {
            await playAudioFile(nextFile, nextIndex);
            console.log('[DownloadsScreen] Successfully played next file');
          } catch (playError) {
            const isAudioFocus = (playError?.message && String(playError.message).includes('AudioFocusNotAcquiredException')) ||
              (playError?.message && String(playError.message).includes('Audio focus could not be acquired'));
            if (isAudioFocus) {
              console.warn('[DownloadsScreen] Audio focus not acquired during handleNext (복귀 직후 등):', playError?.message);
            } else {
              console.error('[DownloadsScreen] Error in playAudioFile during handleNext:', playError);
            }
            if (!MEDIA_SESSION_DISABLED && currentFile) {
              console.log('[DownloadsScreen] Maintaining current file notification after playAudioFile error');
              await mediaSessionService.updateMetadata({
                id: currentFile.id || currentFileIndex,
                title: currentFile.title || currentFile.fileName,
                author: currentFile.author || '',
                thumbnail: currentFile.thumbnail || null,
              });
              await mediaSessionService.updatePlaybackState(isPlaying, true, true, null, null, false);
            }
          }
        } else {
          console.warn('[DownloadsScreen] Next file not found at index:', nextIndex);
          // 다음 파일이 없으면 재생 중지
          await handleStopPlaylist();
        }
      } else {
        console.log('[DownloadsScreen] Last song, cannot go next');
        if (!MEDIA_SESSION_DISABLED && currentFile) {
          await mediaSessionService.updatePlaybackState(isPlaying, false, currentFileIndex > 0, null, null, false);
        }
      }
    } catch (error) {
      console.error('[DownloadsScreen] Error in handleNext:', error);
      try {
        if (!MEDIA_SESSION_DISABLED && currentFile) {
          const canGoNext = currentFileIndex < currentPlaylist.length - 1;
          const canGoPrevious = currentFileIndex > 0;
          await mediaSessionService.updateMetadata({
            id: currentFile.id || currentFileIndex,
            title: currentFile.title || currentFile.fileName,
            author: currentFile.author || '',
            thumbnail: currentFile.thumbnail || null,
          });
          await mediaSessionService.updatePlaybackState(isPlaying, canGoNext, canGoPrevious, null, null, false);
        }
      } catch (updateError) {
        console.error('[DownloadsScreen] Error updating notification after handleNext error:', updateError);
      }
    }
  };

  // ✅ 이전 곡
  const handlePrevious = async () => {
    // ref에서 최신 값 가져오기
    const currentPlaylist = playlistRef.current.length > 0 ? playlistRef.current : playlist;
    const currentFileIndex = currentIndexRef.current >= 0 ? currentIndexRef.current : currentIndex;
    const currentFile = currentPlaylist[currentFileIndex];
    
    // 플레이리스트가 비어있으면 복원 시도
    if (currentPlaylist.length === 0) {
      console.log('[DownloadsScreen] Playlist is empty in handlePrevious, attempting to restore');
      try {
        // downloadedFiles가 비어있으면 먼저 로드 (잠금화면에서 들어올 때 필요)
        let filesToUse = downloadedFiles;
        if (filesToUse.length === 0) {
          console.log('[DownloadsScreen] downloadedFiles is empty, loading files...');
          // getDownloadedFiles를 직접 호출하여 즉시 사용 가능한 파일 목록 가져오기
          const files = await getDownloadedFiles();
          // 플레이리스트 정보도 함께 로드
          const filesWithPlaylists = await Promise.all(
            files.map(async (file) => {
              const filePlaylists = await getPlaylistsForFile(file.fileUri);
              return {
                ...file,
                playlist_ids: filePlaylists.map(p => p.playlist_id),
                playlist_names: filePlaylists.map(p => p.playlist_name),
              };
            })
          );
          filesToUse = filesWithPlaylists;
        }
        
        const savedPlaylist = await AsyncStorage.getItem('currentPlaylist');
        const savedIndex = await AsyncStorage.getItem('currentIndex');
        
        if (savedPlaylist) {
          const parsedPlaylist = JSON.parse(savedPlaylist);
          const restoredPlaylist = parsedPlaylist.map(savedFile => {
            return filesToUse.find(file => file.fileUri === savedFile.fileUri) || savedFile;
          }).filter(file => file != null);
          
          if (restoredPlaylist.length > 0) {
            setPlaylist(restoredPlaylist);
            playlistRef.current = restoredPlaylist;
            
            const restoredIndex = savedIndex ? parseInt(savedIndex, 10) : 0;
            if (restoredIndex >= 0 && restoredIndex < restoredPlaylist.length) {
              setCurrentIndex(restoredIndex);
              currentIndexRef.current = restoredIndex;
              
              await playAudioFile(restoredPlaylist[restoredIndex], restoredIndex);
              return;
            }
          }
        }
      } catch (error) {
        console.error('[DownloadsScreen] Error restoring playlist in handlePrevious:', error);
      }
      return;
    }
    
    try {
      if (currentFileIndex > 0) {
        const prevIndex = currentFileIndex - 1;
        const prevFile = currentPlaylist[prevIndex];
        if (prevFile) {
          await playAudioFile(prevFile, prevIndex);
        } else {
          console.warn('[DownloadsScreen] Previous file not found at index:', prevIndex);
        }
      } else {
        console.log('[DownloadsScreen] First song, cannot go previous');
        if (!MEDIA_SESSION_DISABLED && currentFile) {
          await mediaSessionService.updatePlaybackState(isPlaying, currentFileIndex < currentPlaylist.length - 1, false, null, null, false);
        }
      }
    } catch (error) {
      console.error('[DownloadsScreen] Error in handlePrevious:', error);
      try {
        if (!MEDIA_SESSION_DISABLED && currentFile) {
          const canGoNext = currentFileIndex < currentPlaylist.length - 1;
          const canGoPrevious = currentFileIndex > 0;
          await mediaSessionService.updateMetadata({
            id: currentFile.id || currentFileIndex,
            title: currentFile.title || currentFile.fileName,
            author: currentFile.author || '',
            thumbnail: currentFile.thumbnail || null,
          });
          await mediaSessionService.updatePlaybackState(isPlaying, canGoNext, canGoPrevious, null, null, false);
        }
      } catch (updateError) {
        console.error('[DownloadsScreen] Error updating notification after handlePrevious error:', updateError);
      }
    }
  };

  // ✅ 재생 중지
  const handleStopPlaylist = async () => {
    try {
      if (soundRef.current) {
        try {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
        } catch (e) { /* 이미 정리된 경우 등 */ }
        soundRef.current = null;
      }
      setSound(null);
      setIsPlaying(false);
      setPlaylist([]);
      playlistRef.current = []; // ref도 초기화
      setCurrentIndex(0);
      currentIndexRef.current = 0; // ref도 초기화
      setPlayingPlaylistFilter(null); // 재생 중지 시 필터 초기화
      
      // AsyncStorage에서도 제거
      try {
        await AsyncStorage.removeItem('currentPlaylist');
        await AsyncStorage.removeItem('currentIndex');
      } catch (error) {
        console.error('[DownloadsScreen] Error removing playlist from AsyncStorage:', error);
      }

      if (!MEDIA_SESSION_DISABLED) await mediaSessionService.dismiss();
      AudioPlaybackService.stop();
    } catch (error) {
      console.error('[DownloadsScreen] Error stopping playlist:', error);
    }
  };

  // ✅ 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      AudioPlaybackService.stop();
      if (soundRef.current) {
        // 앱 리로드 시 백그라운드 스레드에서 실행될 수 있으므로 안전하게 처리
        const cleanup = async () => {
          try {
            const sound = soundRef.current;
            if (sound) {
              await sound.stopAsync();
              await sound.unloadAsync();
            }
          } catch (error) {
            // 앱 리로드 중 발생하는 오류는 무시 (이미 리소스가 정리되고 있음)
            if (error.message && error.message.includes('Player is accessed on the wrong thread')) {
              console.log('[DownloadsScreen] Ignoring thread error during app reload');
            } else {
              console.error('[DownloadsScreen] Error cleaning up sound:', error);
            }
          } finally {
            soundRef.current = null;
          }
        };
        
        // 메인 스레드에서 실행 시도, 실패하면 백그라운드에서도 안전하게 처리
        try {
          InteractionManager.runAfterInteractions(() => {
            cleanup();
          });
        } catch (error) {
          // InteractionManager 실패 시에도 cleanup 실행
          cleanup();
        }
      }
    };
  }, []);

  // 화면 포커스 시 파일 목록 및 플레이리스트 새로고침
  // 단, 외부 앱에서 돌아온 직후에는 새로고침하지 않음 (의도치 않은 네비게이션 방지)
  const lastFocusTime = React.useRef(0);
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      // 마지막 포커스로부터 1초 이상 지났을 때만 새로고침
      // (외부 앱에서 빠르게 돌아온 경우는 제외)
      if (now - lastFocusTime.current > 1000) {
        loadPlaylists();
        loadDownloadedFiles();
      }
      lastFocusTime.current = now;
    }, [loadDownloadedFiles, loadPlaylists])
  );

  // 컴포넌트 마운트 시 플레이리스트 목록 로드 및 백그라운드 오디오 설정
  useEffect(() => {
    loadPlaylists();
    
    // 백그라운드 오디오 재생 활성화
    Audio.setAudioModeAsync(getAudioModeConfig()).catch(error => {
      console.error('[DownloadsScreen] Error setting audio mode:', error);
    });

    if (!MEDIA_SESSION_DISABLED) {
      mediaSessionService.initialize().catch(error => {
        console.error('[DownloadsScreen] Error initializing media session service:', error);
      });
    }

    // Seek 핸들러 (트랙바 드래그 시 호출)
    const handleSeek = async (positionMillis) => {
      try {
        if (!soundRef.current) return;
        
        // seek 시작 플래그 설정 (status 업데이트 무시 시작)
        isSeekingRef.current = true;
        
        // 1. 현재 재생 중이었는지 확인
        const status = await soundRef.current.getStatusAsync();
        const wasPlaying = status.isPlaying;
        const duration = status.isLoaded ? status.durationMillis : 0;
        
        // 2. 오디오 이동
        await soundRef.current.setPositionAsync(positionMillis);
        
        if (!MEDIA_SESSION_DISABLED) {
          const currentPlaylist = playlistRef.current.length > 0 ? playlistRef.current : playlist;
          const currentFileIndex = currentIndexRef.current >= 0 ? currentIndexRef.current : currentIndex;
          const canGoNext = currentFileIndex < currentPlaylist.length - 1;
          const canGoPrevious = currentFileIndex > 0;
          await mediaSessionService.updatePlaybackState(wasPlaying, canGoNext, canGoPrevious, positionMillis, duration || 0);
          await mediaSessionService.showNotification();
        }

        // 4. SEEK 전에 재생 중이었다면 재생 계속 (세션 복구용 모드 재설정 후)
        if (wasPlaying) {
          try {
            await Audio.setAudioModeAsync(getAudioModeConfig());
            await soundRef.current.playAsync();
          } catch (playError) {
            console.warn('[DownloadsScreen] Error resuming playback after seek:', playError);
          }
        }
        
        // 5. 약간의 지연 후 Seek 플래그 해제 (네이티브 상태 안정화 대기)
        setTimeout(() => {
          isSeekingRef.current = false;
        }, 500);
        
      } catch (error) {
        isSeekingRef.current = false; // 오류 발생 시에도 플래그 해제
        console.error('[DownloadsScreen] Error seeking:', error);
      }
    };

    if (!MEDIA_SESSION_DISABLED) {
      mediaSessionService.setCallbacks({
        onPlayPause: handlePlayPause,
        onPlay: handlePlay,
        onPause: handlePause,
        onNext: handleNext,
        onPrevious: handlePrevious,
        onStop: handleStopPlaylist,
        onSeek: handleSeek,
      });
    }

    // 백그라운드 → 포그라운드 복귀 시 오디오 세션 재설정 (소리 없는 재생·Play/Pause 먹통 방지)
    // 포그라운드 → 백그라운드 시 Foreground Service 재강조 (재생 유지 확실히)
    let appStatePrev = AppState.currentState;
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      const prev = appStatePrev;
      appStatePrev = nextState;
      // 앱이 백그라운드로 갈 때: 재생 중이면 서비스를 다시 한 번 강조 (일부 기기에서 유지율 향상)
      if (nextState === 'background' && (soundRef.current || playlistRef.current?.length > 0)) {
        const pl = playlistRef.current || [];
        const idx = Math.max(0, Math.min(currentIndexRef.current, pl.length - 1));
        const file = pl[idx];
        if (file) {
          AudioPlaybackService.start(file.title || file.fileName, file.author);
        }
      }
      if ((prev === 'background' || prev === 'inactive') && nextState === 'active') {
        Audio.setAudioModeAsync(getAudioModeConfig()).catch(e =>
          console.warn('[DownloadsScreen] AppState audio reset:', e)
        );
        if (soundRef.current && isPlayingRef.current) {
          soundRef.current.playAsync().catch(e =>
            console.warn('[DownloadsScreen] AppState play nudge:', e)
          );
        } else if (!soundRef.current && playlistRef.current.length > 0) {
          const pl = playlistRef.current;
          const idx = Math.max(0, Math.min(currentIndexRef.current, pl.length - 1));
          const file = pl[idx];
          if (file) {
            playAudioFile(file, idx).catch(e =>
              console.warn('[DownloadsScreen] AppState 복귀 시 재생 재시작 실패:', e?.message)
            );
          }
        }
      }
    });

    return () => {
      appStateSub?.remove?.();
      if (!MEDIA_SESSION_DISABLED) {
        mediaSessionService.dismiss().catch(error => {
          console.error('[DownloadsScreen] Error dismissing media session:', error);
        });
      }
    };
  }, [loadPlaylists]);

  // 다운로드한 파일 재생 (외부 플레이어로 열기)
  const handlePlayFile = async (file) => {
    try {
      if (Platform.OS === 'android') {
        let contentUri = null;
        
        // videoId가 있으면 외부 저장소에서 파일 찾기 시도
        if (file.videoId && MediaStoreModule && typeof MediaStoreModule.getContentUriByVideoId === 'function') {
          try {
            contentUri = await MediaStoreModule.getContentUriByVideoId(file.videoId, file.isVideo);
            console.log('[DownloadsScreen] ✅ Found file in external storage, using it for playback:', contentUri);
          } catch (error) {
            console.warn('[DownloadsScreen] ⚠️ Could not find file in external storage by videoId, falling back to internal file:', error.message);
            // 외부 저장소에서 찾지 못하면 내부 저장소 파일 사용
          }
        }
        
        // 외부 저장소에서 찾지 못했으면 내부 저장소 파일 사용
        if (!contentUri) {
          // 파일 존재 확인
          const fileInfo = await FileSystem.getInfoAsync(file.fileUri);
          if (!fileInfo.exists) {
            Alert.alert(t.error, t.fileNotFound);
            return;
          }
          
          // FileProvider를 사용하여 content:// URI 생성
          if (MediaStoreModule && typeof MediaStoreModule.getContentUri === 'function') {
            contentUri = await MediaStoreModule.getContentUri(file.fileUri);
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
      console.error('[DownloadsScreen] Error playing file:', error);
      console.error('[DownloadsScreen] Error details:', JSON.stringify(error, null, 2));
      Alert.alert(t.error, t.cannotPlayFile.replace('{error}', error.message || t.unknownError));
    }
  };

  // 다운로드한 파일 재저장
  const handleResaveFile = async (file) => {
    try {
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
      console.error('[DownloadsScreen] Error resaving file:', error);
      Alert.alert(t.error, error.message || t.saveFileError);
    }
  };

  // 플레이리스트 관리 핸들러
  const handlePlaylistCreate = async (playlistName) => {
    try {
      await createPlaylist(playlistName);
      await loadPlaylists();
      Alert.alert(t.complete, t.playlistGroupCreated);
    } catch (error) {
      console.error('[DownloadsScreen] Error creating playlist:', error);
      Alert.alert(t.error, t.playlistGroupCreateError);
    }
  };

  const handlePlaylistUpdate = async (playlistId, newPlaylistName) => {
    try {
      await updatePlaylist(playlistId, newPlaylistName);
      await loadPlaylists();
      await loadDownloadedFiles();
      Alert.alert(t.complete, t.playlistGroupRenamed);
    } catch (error) {
      console.error('[DownloadsScreen] Error updating playlist:', error);
      Alert.alert(t.error, t.playlistGroupRenameError);
    }
  };

  const handlePlaylistDelete = async (playlistId) => {
    try {
      await deletePlaylist(playlistId);
      if (playlistFilter === playlistId) {
        setPlaylistFilter(null);
      }
      await loadPlaylists();
      await loadDownloadedFiles();
      Alert.alert(t.complete, t.playlistGroupDeleted);
    } catch (error) {
      console.error('[DownloadsScreen] Error deleting playlist:', error);
      Alert.alert(t.error, t.playlistGroupDeleteError);
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
      
      // 선택된 플레이리스트 ID로 플레이리스트 데이터 배열 생성
      const playlistDataArray = selectedPlaylistIds.map(playlistId => {
        const playlist = playlists.find(p => p.playlist_id === playlistId);
        if (!playlist) {
          // 플레이리스트를 찾을 수 없으면 데이터베이스에서 직접 조회
          console.warn('[DownloadsScreen] Playlist not found in local state, ID:', playlistId);
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
      
      await loadDownloadedFiles();
      await loadPlaylists();
      setSelectedFileForPlaylist(null);
      setSelectedPlaylistIds([]);
    } catch (error) {
      console.error('[DownloadsScreen] Error assigning playlists:', error);
      Alert.alert(t.error, t.playlistGroupAssignError);
    }
  };

  const handlePlaylistSelectorCreate = async (playlistName) => {
    if (!selectedFileForPlaylist) return;
    
    try {
      // 플레이리스트 생성
      const playlistId = await createPlaylist(playlistName);
      
      // 선택된 플레이리스트 목록에 추가
      setSelectedPlaylistIds(prev => [...prev, playlistId]);
      
      // 플레이리스트 목록 새로고침
      await loadPlaylists();
    } catch (error) {
      console.error('[DownloadsScreen] Error creating playlist:', error);
      Alert.alert(t.error, t.playlistGroupCreateError);
    }
  };

  // 다운로드한 파일 삭제
  const handleDeleteFile = async (file) => {
      Alert.alert(
      t.deleteFileTitle,
      t.deleteFileMessage.replace('{name}', file.title),
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.delete,
          style: 'destructive',
          onPress: async () => {
            try {
              // 파일 존재 확인
              const fileInfo = await FileSystem.getInfoAsync(file.fileUri);
              if (fileInfo.exists) {
                // 내부 저장소에서 파일 삭제
                await FileSystem.deleteAsync(file.fileUri, { idempotent: true });
                console.log('[DownloadsScreen] File deleted:', file.fileName);
                
                // ✅ 메타데이터 정리 및 썸네일 캐시 스마트 삭제
                await deleteFileWithMetadata(file.fileName, file.videoId);
                
                // 파일 목록 새로고침
                loadDownloadedFiles();
                
                Alert.alert(t.complete, t.fileDeleted);
              } else {
                Alert.alert(t.notice, t.fileNotFound);
                // 목록 새로고침 (이미 삭제된 파일일 수 있음)
                loadDownloadedFiles();
              }
            } catch (error) {
              console.error('[DownloadsScreen] Error deleting file:', error);
              Alert.alert(t.error, error.message || t.deleteFileError);
            }
          }
        }
      ]
    );
  };

  // 데이터 배열에 광고 삽입 (3개마다)
  const getDataWithAds = () => {
    if (filteredFiles.length === 0) {
      return [];
    }
    
    const result = [];
    // 첫 번째 항목 추가
    result.push(filteredFiles[0]);
    
    // 첫 번째 항목 다음에 광고 추가 (하단에 표시되도록)
    if (filteredFiles.length > 0) {
      result.push({ type: 'ad', id: 'ad-bottom' });
    }
    
    // 나머지 항목들을 3개마다 광고 삽입
    for (let i = 1; i < filteredFiles.length; i++) {
      result.push(filteredFiles[i]);
      // 3개마다 광고 삽입 (인덱스 1, 4, 7, ... 이후)
      if ((i - 1) % 3 === 2) {
        result.push({ type: 'ad', id: `ad-${i}` });
      }
    }
    
    return result;
  };

  // 다운로드한 파일 항목 렌더링
  // 파일 아이템 클릭 시 SearchScreen으로 이동
  const handleFileItemPress = (item) => {
    if (!item.videoId) {
      Alert.alert(t.notice, t.noVideoUrl);
      return;
    }

    try {
      const videoUrl = `https://www.youtube.com/watch?v=${item.videoId}`;
      console.log('[DownloadsScreen] Navigating to Search with URL:', videoUrl);
      
      const params = {
        url: videoUrl,
        timestamp: Date.now(),
        forceUpdate: true,
        forceReload: true, // 강제 리로드로 이전 결과 초기화
      };
      
      // Tab Navigator 내에서 Search 탭으로 이동
      // 같은 Tab Navigator 내에 있으므로 직접 navigate 가능
      if (navigation.navigate) {
        navigation.navigate('Search', params);
      } else {
        // navigation 객체가 없거나 navigate 메서드가 없는 경우
        const tabNav = navigation.getParent?.();
        if (tabNav?.navigate) {
          tabNav.navigate('Search', params);
        } else {
          throw new Error('Navigation not available');
        }
      }
    } catch (error) {
      console.error('[DownloadsScreen] Error navigating to Search:', error);
      Alert.alert(t.error, t.cannotNavigateToSearch);
    }
  };

  const renderFileItem = ({ item }) => {
    // 광고 아이템인 경우
    if (item.type === 'ad') {
      return <AdBanner style={{ marginVertical: 10 }} />;
    }
    
    const fileSizeMB = (item.size / (1024 * 1024)).toFixed(2);
    
    // ✅ 썸네일 표시: 온라인에서는 영상 URL 우선, 실패 시 캐시 사용
    const cachePath = item.videoId ? thumbnailCachePaths[item.videoId] : null;
    const cacheUri = cachePath ? `file://${cachePath}` : null;
    
    return (
      <TouchableOpacity 
        style={styles.fileItem}
        onPress={() => handleFileItemPress(item)}
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
            {(item.thumbnailUrl || cacheUri) ? (
              <ThumbnailImage
                sourceUri={item.thumbnailUrl}
                cacheUri={cacheUri}
                style={styles.fileThumbnail}
              />
            ) : (
              <View style={[styles.fileThumbnail, styles.fileThumbnailPlaceholder]}>
                <Ionicons 
                  name={item.isVideo ? "videocam" : "musical-notes"} 
                  size={24} 
                  color={item.isVideo ? "#FF0000" : "#4CAF50"} 
                />
              </View>
            )}
            {/* ✅ 썸네일 위에 아이콘 오버레이 */}
            {(item.thumbnailUrl || cacheUri) && (
              <View style={styles.fileThumbnailIcon}>
                <Ionicons 
                  name={item.isVideo ? "videocam" : "musical-notes"} 
                  size={14} 
                  color={item.isVideo ? "#FF0000" : "#4CAF50"} 
                />
              </View>
            )}
          </View>
          <View style={styles.fileDetails}>
            <Text style={styles.fileName} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.fileSize}>
              {fileSizeMB} MB • {item.isVideo ? t.video : t.music}
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
              <Text style={styles.actionButtonText}>{t.play}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                shareDownloadedFile(item.fileUri, item.fileName, item.isVideo, item.videoId);
              }}
            >
              <Ionicons name="share" size={24} color="#2196F3" />
              <Text style={styles.actionButtonText}>{t.share}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                handleResaveFile(item);
              }}
            >
              <Ionicons name="save" size={24} color="#FF9800" />
              <Text style={styles.actionButtonText}>{t.resave}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={(e) => {
                e.stopPropagation();
                handleDeleteFile(item);
              }}
            >
              <Ionicons name="trash" size={24} color="#f44336" />
              <Text style={[styles.actionButtonText, styles.deleteButtonText]}>{t.delete}</Text>
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

      {/* 검색 바 */}
      {!loading && (
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={t.searchFilesPlaceholder}
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
          return downloadedFiles.some(file => {
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
                {t.all}
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
              {t.all}
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
              {t.video}
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
              {t.music}
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
              {sortBy === 'date-desc' ? t.newest : sortBy === 'date-asc' ? t.oldest : t.newest}
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
              {t.titleSort}
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
                    
                    // 재생 중이고, 현재 필터가 재생 시작 시의 필터와 일치할 때만 "재생 중" 표시
                    if (isPlaying && playingPlaylistFilter === playlistFilter) {
                      return `${playlistPrefix}${t.playing} (${currentIndex + 1}/${playlist.length})`;
                    } else {
                      return `${playlistPrefix}${t.playFromStart} (${filteredFiles.filter(f => !f.isVideo).length}${t.songs})`;
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
                    ? `${t.playing} (${currentIndex + 1}/${playlist.length})` 
                    : `${t.playFromStart} (${filteredFiles.filter(f => !f.isVideo).length}${t.songs})`
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
                    
                    // 재생 중이고, 현재 필터가 재생 시작 시의 필터와 일치할 때만 "재생 중" 표시
                    if (isPlaying && playingPlaylistFilter === playlistFilter) {
                      return `${playlistPrefix}${t.playing} (${currentIndex + 1}/${playlist.length})`;
                    } else {
                      return `${playlistPrefix}${t.playFromStart} (${filteredFiles.filter(f => !f.isVideo).length}${t.songs})`;
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
                    ? `${t.playing} (${currentIndex + 1}/${playlist.length})` 
                    : `${t.playFromStart} (${filteredFiles.filter(f => !f.isVideo).length}${t.songs})`
                  }
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FF0000" />
          <Text style={styles.loadingText}>{t.loadingFiles}</Text>
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
                  ? t.noSearchResults 
                  : fileTypeFilter === 'video' 
                    ? t.noDownloadedVideos
                    : fileTypeFilter === 'audio'
                      ? t.noDownloadedMusic
                      : t.noDownloadedFiles
                }
              </Text>
              <Text style={styles.emptySubText}>
                {searchQuery 
                  ? t.tryDifferentQuery 
                  : t.tryDownloadVideo
                }
              </Text>
            </View>
          }
          contentContainerStyle={filteredFiles.length === 0 ? styles.listContentEmpty : styles.listContent}
        />
      )}

      {/* ✅ MiniPlayer (음악 재생 중일 때만 표시) */}
      {(() => {
        // playlistRef를 우선 사용 (잠금화면에서 들어올 때 state가 비어있을 수 있음)
        const currentPlaylist = playlistRef.current.length > 0 ? playlistRef.current : playlist;
        const currentFileIndex = currentIndexRef.current >= 0 ? currentIndexRef.current : currentIndex;
        
        if (currentPlaylist.length > 0 && currentPlaylist[currentFileIndex]) {
          return (
            <MiniPlayer
              isVisible={true}
              isPlaying={isPlaying}
              currentItem={currentPlaylist[currentFileIndex]}
              currentIndex={currentFileIndex}
              totalItems={currentPlaylist.length}
              onPlayPause={handlePlayPause}
              onPrevious={handlePrevious}
              onNext={handleNext}
              onClose={handleStopPlaylist}
            />
          );
        }
        return null;
      })()}

      {/* 플레이리스트 관리 모달 */}
      <PinManagerModal
        visible={showPlaylistManager}
        onClose={() => setShowPlaylistManager(false)}
        pins={playlists.map(p => ({ pin_id: p.playlist_id, pin_name: p.playlist_name }))}
        onPinCreate={handlePlaylistCreate}
        onPinUpdate={handlePlaylistUpdate}
        onPinDelete={handlePlaylistDelete}
        labelType="playlist"
        files={downloadedFiles}
      />

      {/* 플레이리스트 선택 모달 */}
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
  playlistButton: {
    marginRight: 8,
    padding: 4,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  playlistBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  searchSection: {
    padding: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
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
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
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
  filterToggleButton: {
    padding: 4,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
    width: 28,
    height: 28,
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    paddingVertical: 0,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
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
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubText: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
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
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  playlistBadgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
    gap: 6,
  },
  playlistBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  playlistBadgeText: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '600',
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  fileIcon: {
    marginRight: 12,
  },
  fileThumbnailContainer: {
    width: 60,
    height: 45,
    marginRight: 12,
    position: 'relative',
  },
  fileThumbnail: {
    width: 60,
    height: 45,
    borderRadius: 8,
    backgroundColor: '#ddd',
  },
  fileThumbnailPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  fileThumbnailIcon: {
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
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
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
    gap: 12,
  },
  playlistIconButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  actionButton: {
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    minWidth: 60,
  },
  actionButtonText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  deleteButton: {
    backgroundColor: '#ffebee',
  },
  deleteButtonText: {
    color: '#f44336',
    fontWeight: '500',
  },
});

