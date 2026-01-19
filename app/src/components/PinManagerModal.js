import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  FlatList,
  Alert,
  Platform,
  ScrollView,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../locales/translations';

export default function PinManagerModal({
  visible,
  onClose,
  pins,
  onPinCreate,
  onPinUpdate,
  onPinDelete,
  labelType = 'bookmark',
  files = [], // 파일 목록 (플레이리스트에 파일이 있는지 확인용)
}) {
  const { currentLanguage } = useLanguage();
  const t = translations[currentLanguage];
  const [editingPinId, setEditingPinId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [newPinName, setNewPinName] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const flatListRef = useRef(null);

  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  const handleStartEdit = (pin) => {
    setEditingPinId(pin.pin_id);
    setEditingName(pin.pin_name);
    // 편집 중인 항목이 보이도록 스크롤
    setTimeout(() => {
      const index = pins.findIndex(p => p.pin_id === pin.pin_id);
      if (index !== -1 && flatListRef.current) {
        flatListRef.current.scrollToIndex({ 
          index, 
          animated: true, 
          viewPosition: 0.1 
        });
      }
    }, 300);
  };

  const handleSaveEdit = () => {
    if (editingName.trim()) {
      // 중복 체크 (현재 편집 중인 항목 제외)
      const isDuplicate = pins.some(
        pin => pin.pin_id !== editingPinId && 
        pin.pin_name.trim().toLowerCase() === editingName.trim().toLowerCase()
      );
      
      if (isDuplicate) {
        const typeName = labelType === 'bookmark' ? t.bookmarkGroupSelect : labelType === 'playlist' ? t.playlistSelect : 'Pin';
        Alert.alert(
          t.duplicateName,
          t.duplicateNameMessage.replace('{name}', editingName.trim()).replace('{type}', typeName),
          [{ text: t.ok }]
        );
        return;
      }
      
      onPinUpdate(editingPinId, editingName.trim());
      setEditingPinId(null);
      setEditingName('');
    }
  };

  const handleCancelEdit = () => {
    setEditingPinId(null);
    setEditingName('');
  };

  const handleCreate = () => {
    if (newPinName.trim()) {
      // 중복 체크
      const isDuplicate = pins.some(
        pin => pin.pin_name.trim().toLowerCase() === newPinName.trim().toLowerCase()
      );
      
      if (isDuplicate) {
        const typeName = labelType === 'bookmark' ? t.bookmarkGroupSelect : labelType === 'playlist' ? t.playlistSelect : 'Pin';
        Alert.alert(
          t.duplicateName,
          t.duplicateNameMessage.replace('{name}', newPinName.trim()).replace('{type}', typeName),
          [{ text: t.ok }]
        );
        return;
      }
      
      onPinCreate(newPinName.trim());
      setNewPinName('');
    }
  };

  const handleDelete = (pin) => {
    const typeName = labelType === 'bookmark' ? t.bookmarkGroupSelect : labelType === 'playlist' ? t.playlistSelect : 'Pin';
    Alert.alert(
      t.deleteConfirm,
      t.deleteConfirmMessage.replace('{name}', pin.pin_name).replace('{type}', typeName),
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.delete,
          style: 'destructive',
          onPress: () => onPinDelete(pin.pin_id),
        },
      ]
    );
  };

  const renderPinItem = ({ item: pin }) => {
    // 해당 핀(플레이리스트 또는 찜하기그룹)에 파일/찜하기가 있는지 확인
    const hasFiles = labelType === 'playlist' && files.length > 0
      ? files.some(file => {
          const playlistIds = file.playlist_ids || [];
          return playlistIds.includes(pin.pin_id);
        })
      : labelType === 'bookmark' && files.length > 0
      ? files.some(file => {
          const pinIds = file.pin_ids || (file.pin_id ? [file.pin_id] : []);
          return pinIds.includes(pin.pin_id);
        })
      : true; // files가 없으면 true (초기 로딩 중일 수 있음)
    
    const iconColor = hasFiles 
      ? (labelType === 'playlist' ? '#4CAF50' : labelType === 'bookmark' ? '#ff6b6b' : '#FF9800')
      : '#999'; // 파일이 없으면 회색

    if (editingPinId === pin.pin_id) {
      return (
        <View style={styles.pinItem} onLayout={() => {
          // 편집 항목이 렌더링된 후 스크롤
          setTimeout(() => {
            const index = pins.findIndex(p => p.pin_id === pin.pin_id);
            if (index !== -1 && flatListRef.current) {
              flatListRef.current.scrollToIndex({ 
                index, 
                animated: true, 
                viewPosition: 0.2 
              });
            }
          }, 100);
        }}>
          <TextInput
            style={styles.editInput}
            value={editingName}
            onChangeText={setEditingName}
            autoFocus
            placeholder={labelType === 'bookmark' ? t.newBookmarkGroupName : labelType === 'playlist' ? t.newPlaylistName : 'Pin name'}
            onFocus={() => {
              // 포커스 시 스크롤
              setTimeout(() => {
                const index = pins.findIndex(p => p.pin_id === pin.pin_id);
                if (index !== -1 && flatListRef.current) {
                  flatListRef.current.scrollToIndex({ 
                    index, 
                    animated: true, 
                    viewPosition: 0.2 
                  });
                }
              }, 300);
            }}
          />
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveEdit}
          >
            <Ionicons name="checkmark" size={20} color="#4CAF50" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelEdit}
          >
            <Ionicons name="close" size={20} color="#f44336" />
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.pinItem}>
        <Ionicons 
          name={labelType === 'playlist' ? 'list' : 'bookmark'} 
          size={20} 
          color={iconColor}
          style={styles.pinIcon} 
        />
        <Text style={styles.pinName} numberOfLines={1}>
          {pin.pin_name}
        </Text>
        <View style={styles.pinActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleStartEdit(pin)}
          >
            <Ionicons name="pencil" size={18} color="#2196F3" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDelete(pin)}
          >
            <Ionicons name="trash" size={18} color="#f44336" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[
          styles.modalContent,
          keyboardHeight > 0 && { marginBottom: keyboardHeight + 20 }
        ]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {labelType === 'bookmark' ? t.bookmarkGroupManagement : labelType === 'playlist' ? t.playlistManagement : 'Pin Management'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {/* 새 그룹 생성 */}
          <View style={styles.createSection}>
            <TextInput
              style={styles.createInput}
              value={newPinName}
              onChangeText={setNewPinName}
              placeholder={labelType === 'bookmark' ? t.newBookmarkGroupName : labelType === 'playlist' ? t.newPlaylistName : 'New pin name'}
              placeholderTextColor="#999"
            />
            <TouchableOpacity
              style={[styles.createButton, !newPinName.trim() && styles.createButtonDisabled]}
              onPress={handleCreate}
              disabled={!newPinName.trim()}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* 플레이리스트 목록 */}
          <View style={styles.flatListContainer}>
          <FlatList
              ref={flatListRef}
            data={pins}
            renderItem={renderPinItem}
            keyExtractor={(item) => item.pin_id.toString()}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onScrollToIndexFailed={(info) => {
                // 스크롤 실패 시 무시
                const wait = new Promise(resolve => setTimeout(resolve, 500));
                wait.then(() => {
                  if (flatListRef.current && info.index < pins.length) {
                    flatListRef.current.scrollToIndex({ index: info.index, animated: true });
                  }
                });
              }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                  <Ionicons 
                    name={labelType === 'playlist' ? 'list-outline' : 'bookmark-outline'} 
                    size={48} 
                    color="#ddd" 
                  />
                <Text style={styles.emptyText}>
                    {labelType === 'bookmark' ? t.bookmarkGroupEmpty : labelType === 'playlist' ? t.playlistEmpty : 'No pins'}
                </Text>
              </View>
            }
            contentContainerStyle={pins.length === 0 ? styles.emptyList : styles.listContent}
          />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 500,
    height: Platform.OS === 'ios' ? '50%' : '48%',
    maxHeight: Platform.OS === 'ios' ? '50%' : '48%',
    paddingTop: 20,
    paddingBottom: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  createSection: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
  },
  createInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
  },
  createButton: {
    backgroundColor: '#FF0000',
    borderRadius: 8,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#ccc',
  },
  flatListContainer: {
    flex: 1,
    minHeight: 200,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999',
  },
  pinItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    marginBottom: 8,
  },
  pinIcon: {
    marginRight: 12,
  },
  pinName: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  pinActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
  editInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2196F3',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: '#333',
  },
  saveButton: {
    padding: 8,
    marginLeft: 8,
  },
  cancelButton: {
    padding: 8,
  },
});
