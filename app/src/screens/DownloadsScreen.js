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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system/legacy';
import AdBanner from '../components/AdBanner';
import { getDownloadedFiles, deleteFileWithMetadata, getThumbnailCachePath } from '../services/downloadService';
import { shareDownloadedFile, saveFileToDevice } from '../services/downloadService';
import MediaStoreModule from '../modules/MediaStoreModule';

// 썸네일 이미지 컴포넌트 (YouTube URL 실패 시 캐시로 폴백)
const ThumbnailImage = ({ sourceUri, cacheUri, style }) => {
  const [imageUri, setImageUri] = React.useState(sourceUri || cacheUri);
  
  const handleError = () => {
    // YouTube URL 로드 실패 시 캐시로 폴백
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
  const [downloadedFiles, setDownloadedFiles] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('all'); // ✅ 'all' | 'video' | 'audio'
  const [thumbnailCachePaths, setThumbnailCachePaths] = useState({}); // videoId -> cache path

  // 다운로드한 파일 목록 로드
  const loadDownloadedFiles = useCallback(async () => {
    try {
      setLoading(true);
      const files = await getDownloadedFiles();
      setDownloadedFiles(files);
      console.log('[DownloadsScreen] Loaded downloaded files:', files.length);
      
      // ✅ 썸네일 캐시 경로 로드
      const cachePaths = {};
      for (const file of files) {
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
      Alert.alert('오류', '다운로드한 파일 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // ✅ 검색 및 타입 필터링
  useEffect(() => {
    let filtered = [...downloadedFiles];
    
    // 파일 타입 필터링
    if (fileTypeFilter === 'video') {
      filtered = filtered.filter(file => file.isVideo);
    } else if (fileTypeFilter === 'audio') {
      filtered = filtered.filter(file => !file.isVideo);
    }
    // fileTypeFilter === 'all'이면 모든 파일 표시
    
    // 검색 필터링
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(file =>
        file.title.toLowerCase().includes(query) ||
        file.fileName.toLowerCase().includes(query)
      );
    }
    
    setFilteredFiles(filtered);
  }, [searchQuery, downloadedFiles, fileTypeFilter]);

  // 화면 포커스 시 파일 목록 새로고침
  // 단, 외부 앱에서 돌아온 직후에는 새로고침하지 않음 (의도치 않은 네비게이션 방지)
  const lastFocusTime = React.useRef(0);
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      // 마지막 포커스로부터 1초 이상 지났을 때만 새로고침
      // (외부 앱에서 빠르게 돌아온 경우는 제외)
      if (now - lastFocusTime.current > 1000) {
        loadDownloadedFiles();
      }
      lastFocusTime.current = now;
    }, [loadDownloadedFiles])
  );

  // 다운로드한 파일 재생 (외부 플레이어로 열기)
  const handlePlayFile = async (file) => {
    try {
      if (Platform.OS === 'android') {
        // ✅ 공유하기/저장하기와 동일한 방식으로 파일 찾기 (여러 경로 시도)
        let fileUri = file.fileUri;
        const fileName = file.fileName;
        const DOWNLOAD_DIR = `${FileSystem.documentDirectory}downloads/`;
        
        console.log('[DownloadsScreen] Playing file:', fileUri, fileName);
        let fileInfo = await FileSystem.getInfoAsync(fileUri);
        
        if (!fileInfo.exists) {
          // 1. URL 디코딩 시도
          try {
            const decodedUri = decodeURIComponent(fileUri);
            if (decodedUri !== fileUri) {
              console.log('[DownloadsScreen] Trying decoded URI:', decodedUri);
              fileInfo = await FileSystem.getInfoAsync(decodedUri);
              if (fileInfo.exists) {
                fileUri = decodedUri;
                console.log('[DownloadsScreen] ✅ File found with decoded URI');
              }
            }
          } catch (e) {
            console.warn('[DownloadsScreen] Could not decode URI:', e);
          }
          
          // 2. file:// 프로토콜 제거 후 시도
          if (!fileInfo.exists && fileUri.startsWith('file://')) {
            const withoutProtocol = fileUri.replace('file://', '');
            console.log('[DownloadsScreen] Trying URI without file:// protocol:', withoutProtocol);
            fileInfo = await FileSystem.getInfoAsync(withoutProtocol);
            if (fileInfo.exists) {
              fileUri = withoutProtocol;
              console.log('[DownloadsScreen] ✅ File found without file:// protocol');
            }
          }
          
          // 3. file:// 프로토콜 추가 후 시도
          if (!fileInfo.exists && !fileUri.startsWith('file://')) {
            const withProtocol = `file://${fileUri}`;
            console.log('[DownloadsScreen] Trying URI with file:// protocol:', withProtocol);
            fileInfo = await FileSystem.getInfoAsync(withProtocol);
            if (fileInfo.exists) {
              fileUri = withProtocol;
              console.log('[DownloadsScreen] ✅ File found with file:// protocol');
            }
          }
          
          // 4. 파일명으로 경로 재구성 시도 (DOWNLOAD_DIR 사용)
          if (!fileInfo.exists && fileName) {
            const reconstructedUri = `${DOWNLOAD_DIR}${fileName}`;
            if (reconstructedUri !== fileUri && !reconstructedUri.includes(fileUri) && !fileUri.includes(reconstructedUri)) {
              console.log('[DownloadsScreen] Trying reconstructed URI from fileName:', reconstructedUri);
              fileInfo = await FileSystem.getInfoAsync(reconstructedUri);
              if (fileInfo.exists) {
                fileUri = reconstructedUri;
                console.log('[DownloadsScreen] ✅ File found with reconstructed URI');
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
                console.log('[DownloadsScreen] Trying alternative URI from path:', altUri);
                fileInfo = await FileSystem.getInfoAsync(altUri);
                if (fileInfo.exists) {
                  fileUri = altUri;
                  console.log('[DownloadsScreen] ✅ File found with alternative URI from path');
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
              console.log('[DownloadsScreen] Trying clean reconstructed URI:', cleanReconstructedUri);
              fileInfo = await FileSystem.getInfoAsync(cleanReconstructedUri);
              if (fileInfo.exists) {
                fileUri = cleanReconstructedUri;
                console.log('[DownloadsScreen] ✅ File found with clean reconstructed URI');
              }
            }
          }
        }
        
        if (!fileInfo.exists) {
          console.error('[DownloadsScreen] ❌ File does not exist after all attempts!');
          Alert.alert('오류', '파일을 찾을 수 없습니다.');
          return;
        }

        // MIME 타입 결정
        let mimeType = file.isVideo ? 'video/*' : 'audio/*';
        
        // 파일 확장자에 따라 더 구체적인 MIME 타입 설정
        const extension = fileName.split('.').pop()?.toLowerCase();
        if (extension === 'mp4') {
          mimeType = 'video/mp4';
        } else if (extension === 'm4a') {
          mimeType = 'audio/mp4';
        } else if (extension === 'mp3') {
          mimeType = 'audio/mpeg';
        }
        
        // FileProvider를 사용하여 content:// URI 생성
        if (MediaStoreModule && typeof MediaStoreModule.getContentUri === 'function') {
          // file:// 프로토콜 제거 (네이티브 모듈은 절대 경로를 원함)
          let normalizedFileUri = fileInfo.uri || fileUri;
          if (normalizedFileUri.startsWith('file://')) {
            normalizedFileUri = normalizedFileUri.replace('file://', '');
          }
          
          const contentUri = await MediaStoreModule.getContentUri(normalizedFileUri);
          
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
      console.error('[DownloadsScreen] Error playing file:', error);
      console.error('[DownloadsScreen] Error details:', JSON.stringify(error, null, 2));
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
      console.error('[DownloadsScreen] Error resaving file:', error);
      Alert.alert('오류', error.message || '파일 저장 중 오류가 발생했습니다.');
    }
  };

  // 다운로드한 파일 삭제
  const handleDeleteFile = async (file) => {
    Alert.alert(
      '파일 삭제',
      `"${file.title}" 파일을 삭제하시겠습니까?\n\n삭제 후에는 다시 다운로드해야 합니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
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
                
                Alert.alert('완료', '파일이 삭제되었습니다.');
              } else {
                Alert.alert('알림', '파일을 찾을 수 없습니다.');
                // 목록 새로고침 (이미 삭제된 파일일 수 있음)
                loadDownloadedFiles();
              }
            } catch (error) {
              console.error('[DownloadsScreen] Error deleting file:', error);
              Alert.alert('오류', error.message || '파일 삭제 중 오류가 발생했습니다.');
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
  const renderFileItem = ({ item }) => {
    // 광고 아이템인 경우
    if (item.type === 'ad') {
      return <AdBanner style={{ marginVertical: 10 }} />;
    }
    
    const fileSizeMB = (item.size / (1024 * 1024)).toFixed(2);
    
    // ✅ 썸네일 표시: 온라인에서는 YouTube URL 우선, 실패 시 캐시 사용
    const cachePath = item.videoId ? thumbnailCachePaths[item.videoId] : null;
    const cacheUri = cachePath ? `file://${cachePath}` : null;
    
    return (
      <View style={styles.fileItem}>
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
              {fileSizeMB} MB • {item.isVideo ? '영상' : '음악'}
            </Text>
          </View>
        </View>
        <View style={styles.fileActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handlePlayFile(item)}
          >
            <Ionicons name="play" size={24} color={item.isVideo ? "#FF0000" : "#4CAF50"} />
            <Text style={styles.actionButtonText}>재생</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => shareDownloadedFile(item.fileUri, item.fileName, item.isVideo)}
          >
            <Ionicons name="share" size={24} color="#2196F3" />
            <Text style={styles.actionButtonText}>공유</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleResaveFile(item)}
          >
            <Ionicons name="save" size={24} color="#FF9800" />
            <Text style={styles.actionButtonText}>재저장</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => handleDeleteFile(item)}
          >
            <Ionicons name="trash" size={24} color="#f44336" />
            <Text style={[styles.actionButtonText, styles.deleteButtonText]}>삭제</Text>
          </TouchableOpacity>
        </View>
      </View>
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
              // Tab Navigator에서 직접 Search 탭으로 이동
              navigation.navigate('Search');
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

      {/* 검색 바 */}
      <View style={styles.searchSection}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="파일명으로 검색..."
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
        </View>
      </View>

      {/* ✅ 파일 타입 필터 버튼 */}
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
            전체
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
            size={16} 
            color={fileTypeFilter === 'video' ? '#fff' : '#666'} 
            style={{ marginRight: 4 }}
          />
          <Text style={[
            styles.filterButtonText,
            fileTypeFilter === 'video' && styles.filterButtonTextActive
          ]}>
            영상
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
            size={16} 
            color={fileTypeFilter === 'audio' ? '#fff' : '#666'} 
            style={{ marginRight: 4 }}
          />
          <Text style={[
            styles.filterButtonText,
            fileTypeFilter === 'audio' && styles.filterButtonTextActive
          ]}>
            음악
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FF0000" />
          <Text style={styles.loadingText}>파일 목록을 불러오는 중...</Text>
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
                  ? '검색 결과가 없습니다' 
                  : fileTypeFilter === 'video' 
                    ? '다운로드한 영상이 없습니다'
                    : fileTypeFilter === 'audio'
                      ? '다운로드한 음악이 없습니다'
                      : '다운로드한 파일이 없습니다'
                }
              </Text>
              <Text style={styles.emptySubText}>
                {searchQuery 
                  ? '다른 검색어를 시도해보세요' 
                  : 'YouTube 영상을 다운로드해보세요'
                }
              </Text>
            </View>
          }
          contentContainerStyle={filteredFiles.length === 0 ? styles.listContentEmpty : styles.listContent}
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
  headerTitle: {
    color: '#fff',
    fontSize: 19,
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
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flex: 1,
  },
  filterButtonActive: {
    backgroundColor: '#FF0000',
    borderColor: '#FF0000',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
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
    justifyContent: 'flex-end',
    gap: 12,
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

