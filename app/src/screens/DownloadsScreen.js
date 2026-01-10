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
import { getDownloadedFiles } from '../services/downloadService';
import { shareDownloadedFile, saveFileToDevice } from '../services/downloadService';
import MediaStoreModule from '../modules/MediaStoreModule';

export default function DownloadsScreen({ navigation }) {
  const [downloadedFiles, setDownloadedFiles] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // 다운로드한 파일 목록 로드
  const loadDownloadedFiles = useCallback(async () => {
    try {
      setLoading(true);
      const files = await getDownloadedFiles();
      setDownloadedFiles(files);
      setFilteredFiles(files);
      console.log('[DownloadsScreen] Loaded downloaded files:', files.length);
    } catch (error) {
      console.error('[DownloadsScreen] Error loading downloaded files:', error);
      Alert.alert('오류', '다운로드한 파일 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 검색 필터링
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFiles(downloadedFiles);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = downloadedFiles.filter(file =>
        file.title.toLowerCase().includes(query) ||
        file.fileName.toLowerCase().includes(query)
      );
      setFilteredFiles(filtered);
    }
  }, [searchQuery, downloadedFiles]);

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
    
    return (
      <View style={styles.fileItem}>
        <View style={styles.fileInfo}>
          <Ionicons 
            name={item.isVideo ? "videocam" : "musical-notes"} 
            size={32} 
            color={item.isVideo ? "#FF0000" : "#4CAF50"} 
            style={styles.fileIcon}
          />
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
                {searchQuery ? '검색 결과가 없습니다' : '다운로드한 파일이 없습니다'}
              </Text>
              <Text style={styles.emptySubText}>
                {searchQuery ? '다른 검색어를 시도해보세요' : 'YouTube 영상을 다운로드해보세요'}
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
    width: 52,
    height: 52,
    overflow: 'hidden',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
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
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
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
});

