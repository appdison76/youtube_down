import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import {
  getFolders,
  createFolder,
  deleteFolder,
  getFavorites,
  deleteFavorite,
} from '../services/database';
import { downloadVideo } from '../services/download';

export default function FavoritesScreen() {
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [selectedFolderId]);

  const loadFolders = async () => {
    try {
      const folderList = await getFolders();
      setFolders(folderList);
      
      // 기본 폴더 선택
      if (folderList.length > 0 && !selectedFolderId) {
        const defaultFolder = folderList.find(f => f.name === '기본 찜하기') || folderList[0];
        setSelectedFolderId(defaultFolder.id);
      }
    } catch (error) {
      Alert.alert('오류', '폴더를 불러오는 중 오류가 발생했습니다');
      console.error('Load folders error:', error);
    }
  };

  const loadFavorites = async () => {
    setLoading(true);
    try {
      const favoriteList = await getFavorites(selectedFolderId);
      setFavorites(favoriteList);
    } catch (error) {
      Alert.alert('오류', '찜하기 목록을 불러오는 중 오류가 발생했습니다');
      console.error('Load favorites error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      Alert.alert('알림', '폴더 이름을 입력해주세요');
      return;
    }

    try {
      await createFolder(newFolderName.trim());
      setNewFolderName('');
      setFolderModalVisible(false);
      await loadFolders();
      Alert.alert('성공', '폴더가 생성되었습니다');
    } catch (error) {
      Alert.alert('오류', error.message || '폴더 생성 중 오류가 발생했습니다');
    }
  };

  const handleDeleteFolder = async (folderId, folderName) => {
    if (folderName === '기본 찜하기') {
      Alert.alert('알림', '기본 폴더는 삭제할 수 없습니다');
      return;
    }

    Alert.alert(
      '폴더 삭제',
      '이 폴더를 삭제하시겠습니까? 폴더의 영상들은 기본 찜하기로 이동됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFolder(folderId);
              await loadFolders();
              if (selectedFolderId === folderId) {
                const defaultFolder = folders.find(f => f.name === '기본 찜하기');
                if (defaultFolder) {
                  setSelectedFolderId(defaultFolder.id);
                }
              }
              Alert.alert('성공', '폴더가 삭제되었습니다');
            } catch (error) {
              Alert.alert('오류', error.message || '폴더 삭제 중 오류가 발생했습니다');
            }
          },
        },
      ]
    );
  };

  const handleDeleteFavorite = async (favoriteId) => {
    Alert.alert('삭제', '찜하기에서 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFavorite(favoriteId);
            await loadFavorites();
            Alert.alert('성공', '삭제되었습니다');
          } catch (error) {
            Alert.alert('오류', error.message || '삭제 중 오류가 발생했습니다');
          }
        },
      },
    ]);
  };

  const handleDownload = async (type) => {
    if (!selectedVideo) return;

    try {
      Alert.alert('알림', `${type} 다운로드를 시작합니다...`);
      await downloadVideo(selectedVideo.video_id, type);
      setDownloadModalVisible(false);
    } catch (error) {
      Alert.alert('오류', error.message || '다운로드 중 오류가 발생했습니다');
    }
  };

  const renderFolderItem = (folder) => (
    <TouchableOpacity
      key={folder.id}
      style={[
        styles.folderItem,
        selectedFolderId === folder.id && styles.folderItemActive,
      ]}
      onPress={() => setSelectedFolderId(folder.id)}
    >
      <Text
        style={[
          styles.folderText,
          selectedFolderId === folder.id && styles.folderTextActive,
        ]}
      >
        📁 {folder.name} ({folder.count || 0})
      </Text>
      {folder.name !== '기본 찜하기' && (
        <TouchableOpacity
          onPress={() => handleDeleteFolder(folder.id, folder.name)}
          style={styles.deleteFolderButton}
        >
          <Text style={styles.deleteFolderText}>✕</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const renderFavoriteItem = ({ item }) => (
    <View style={styles.videoCard}>
      <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
      <View style={styles.videoInfo}>
        <Text style={styles.videoTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.duration && (
          <Text style={styles.videoMeta}>길이: {item.duration}</Text>
        )}
        {item.folder_name && (
          <Text style={styles.videoMeta}>폴더: {item.folder_name}</Text>
        )}
        <View style={styles.videoActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.downloadButton]}
            onPress={() => {
              setSelectedVideo(item);
              setDownloadModalVisible(true);
            }}
          >
            <Text style={styles.actionButtonText}>📥 다운로드</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => handleDeleteFavorite(item.id)}
          >
            <Text style={styles.actionButtonText}>🗑️ 삭제</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.folderSection}>
        <View style={styles.folderHeader}>
          <Text style={styles.sectionTitle}>폴더</Text>
          <TouchableOpacity
            style={styles.createFolderButton}
            onPress={() => setFolderModalVisible(true)}
          >
            <Text style={styles.createFolderButtonText}>+ 새 폴더</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.folderList}>
          {folders.map(renderFolderItem)}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#667eea" />
        </View>
      ) : (
        <FlatList
          data={favorites}
          renderItem={renderFavoriteItem}
          keyExtractor={(item) => item.id.toString()}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>찜한 영상이 없습니다</Text>
            </View>
          }
        />
      )}

      {/* 폴더 생성 모달 */}
      <Modal
        visible={folderModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setFolderModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>새 폴더 만들기</Text>
            <TextInput
              style={styles.folderNameInput}
              placeholder="폴더 이름"
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleCreateFolder}
            >
              <Text style={styles.confirmButtonText}>생성</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setFolderModalVisible(false);
                setNewFolderName('');
              }}
            >
              <Text style={styles.cancelButtonText}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 다운로드 모달 */}
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
  folderSection: {
    backgroundColor: 'white',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  folderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  createFolderButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
  },
  createFolderButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  folderList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 8,
    marginRight: 10,
    marginBottom: 10,
  },
  folderItemActive: {
    backgroundColor: '#667eea',
  },
  folderText: {
    fontSize: 14,
    color: '#333',
  },
  folderTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  deleteFolderButton: {
    marginLeft: 8,
    padding: 4,
  },
  deleteFolderText: {
    color: '#ff6b6b',
    fontSize: 16,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
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
  downloadButton: {
    backgroundColor: '#4ecdc4',
  },
  deleteButton: {
    backgroundColor: '#ff6b6b',
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
  folderNameInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 15,
  },
  confirmButton: {
    backgroundColor: '#667eea',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
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




