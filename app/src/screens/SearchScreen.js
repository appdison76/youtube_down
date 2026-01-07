import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { searchVideos, extractVideoId, getVideoInfoFromUrl } from '../services/youtube';
import { addFavorite } from '../services/database';
import { downloadVideo } from '../services/download';

export default function SearchScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) {
      Alert.alert('알림', '검색어를 입력해주세요');
      return;
    }

    setLoading(true);
    try {
      // URL인지 확인
      const videoId = extractVideoId(query);
      if (videoId) {
        // URL이면 영상 정보 가져오기
        const videoInfo = await getVideoInfoFromUrl(query);
        setResults([videoInfo]);
      } else {
        // 검색어면 검색 실행
        const searchResults = await searchVideos(query);
        setResults(searchResults);
      }
    } catch (error) {
      Alert.alert('오류', error.message || '검색 중 오류가 발생했습니다');
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFavorite = async (video) => {
    try {
      await addFavorite(
        video.id,
        video.title,
        video.thumbnail,
        video.duration || ''
      );
      Alert.alert('성공', '찜하기에 추가되었습니다');
    } catch (error) {
      Alert.alert('오류', error.message || '찜하기 추가 중 오류가 발생했습니다');
    }
  };

  const handleDownload = async (type) => {
    if (!selectedVideo) return;

    try {
      Alert.alert('알림', `${type} 다운로드를 시작합니다...`);
      // 실제 다운로드 로직은 download.js에서 구현
      await downloadVideo(selectedVideo.id, type);
      setDownloadModalVisible(false);
    } catch (error) {
      Alert.alert('오류', error.message || '다운로드 중 오류가 발생했습니다');
    }
  };

  const renderVideoItem = ({ item }) => (
    <View style={styles.videoCard}>
      <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
      <View style={styles.videoInfo}>
        <Text style={styles.videoTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.channel && (
          <Text style={styles.videoMeta}>채널: {item.channel}</Text>
        )}
        {item.duration && (
          <Text style={styles.videoMeta}>길이: {item.duration}</Text>
        )}
        <View style={styles.videoActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.favoriteButton]}
            onPress={() => handleAddFavorite(item)}
          >
            <Text style={styles.actionButtonText}>⭐ 찜하기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.downloadButton]}
            onPress={() => {
              setSelectedVideo(item);
              setDownloadModalVisible(true);
            }}
          >
            <Text style={styles.actionButtonText}>📥 다운로드</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="유튜브 영상 제목, 링크, 또는 내용을 검색하세요..."
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>검색</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.loadingText}>검색 중...</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          renderItem={renderVideoItem}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>검색 결과가 없습니다</Text>
            </View>
          }
        />
      )}

      <Modal
        visible={downloadModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setDownloadModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>다운로드 선택</Text>
            {selectedVideo && (
              <Text style={styles.modalVideoTitle}>{selectedVideo.title}</Text>
            )}
            <TouchableOpacity
              style={styles.downloadOptionButton}
              onPress={() => handleDownload('video')}
            >
              <Text style={styles.downloadOptionText}>📹 영상 다운로드</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.downloadOptionButton}
              onPress={() => handleDownload('audio')}
            >
              <Text style={styles.downloadOptionText}>🎵 음악 다운로드</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.downloadOptionButton}
              onPress={() => handleDownload('subtitle')}
            >
              <Text style={styles.downloadOptionText}>📝 자막 다운로드</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setDownloadModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>취소</Text>
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
    backgroundColor: '#f5f5f5',
  },
  searchSection: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: 'white',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  emptyText: {
    color: '#999',
    fontSize: 16,
  },
  videoCard: {
    backgroundColor: 'white',
    margin: 10,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  thumbnail: {
    width: '100%',
    height: 200,
    backgroundColor: '#e0e0e0',
  },
  videoInfo: {
    padding: 15,
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  videoMeta: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  videoActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  favoriteButton: {
    backgroundColor: '#ff6b6b',
  },
  downloadButton: {
    backgroundColor: '#4ecdc4',
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalVideoTitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  downloadOptionButton: {
    backgroundColor: '#667eea',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  downloadOptionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
});






