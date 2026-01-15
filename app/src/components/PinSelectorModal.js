import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  FlatList,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../locales/translations';

export default function PinSelectorModal({
  visible,
  onClose,
  pins,
  currentPinIds = [],
  onPinSelect,
  onPinCreate,
  onPinUpdate,
  labelType = 'bookmark',
}) {
  const { currentLanguage } = useLanguage();
  const t = translations[currentLanguage];
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newPinName, setNewPinName] = useState('');

  const handleTogglePin = (pinId) => {
    const isSelected = currentPinIds.includes(pinId);
    onPinSelect(pinId, !isSelected);
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
      setShowCreateInput(false);
    }
  };

  const renderPinItem = ({ item: pin }) => {
    const isSelected = currentPinIds.includes(pin.pin_id);

    return (
      <TouchableOpacity
        style={[styles.pinItem, isSelected && styles.pinItemSelected]}
        onPress={() => handleTogglePin(pin.pin_id)}
      >
        <Ionicons
          name={
            labelType === 'playlist' 
              ? (isSelected ? 'list' : 'list-outline')
              : (isSelected ? 'bookmark' : 'bookmark-outline')
          }
          size={20}
          color={
            labelType === 'playlist'
              ? (isSelected ? '#4CAF50' : '#999')
              : (isSelected ? '#ff6b6b' : '#999')
          }
          style={styles.pinIcon}
        />
        <Text
          style={[styles.pinName, isSelected && styles.pinNameSelected]}
          numberOfLines={1}
        >
          {pin.pin_name}
        </Text>
        {isSelected && (
          <Ionicons 
            name="checkmark-circle" 
            size={20} 
            color={labelType === 'playlist' ? '#4CAF50' : '#ff6b6b'} 
          />
        )}
      </TouchableOpacity>
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
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {labelType === 'bookmark' ? t.bookmarkGroupSelect : labelType === 'playlist' ? t.playlistSelect : 'Select Pin'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {/* 새 그룹 생성 */}
          {showCreateInput ? (
            <View style={styles.createSection}>
              <TextInput
                style={styles.createInput}
                value={newPinName}
                onChangeText={setNewPinName}
                placeholder={labelType === 'bookmark' ? t.newBookmarkGroupName : labelType === 'playlist' ? t.newPlaylistName : 'New pin name'}
                placeholderTextColor="#999"
                autoFocus
              />
              <TouchableOpacity
                style={[styles.createButton, !newPinName.trim() && styles.createButtonDisabled]}
                onPress={handleCreate}
                disabled={!newPinName.trim()}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowCreateInput(false);
                  setNewPinName('');
                }}
              >
                <Ionicons name="close" size={20} color="#666" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowCreateInput(true)}
            >
              <Ionicons name="add-circle" size={20} color="#FF0000" />
              <Text style={styles.addButtonText}>
                {labelType === 'bookmark' ? t.createNewBookmarkGroup : labelType === 'playlist' ? t.createNewPlaylist : 'Create new pin'}
              </Text>
            </TouchableOpacity>
          )}

          {/* 플레이리스트 목록 */}
          <FlatList
            data={pins}
            renderItem={renderPinItem}
            keyExtractor={(item) => item.pin_id.toString()}
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
                <Text style={styles.emptySubText}>
                  {t.emptyListHint}
                </Text>
              </View>
            }
            contentContainerStyle={pins.length === 0 ? styles.emptyList : styles.listContent}
          />
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
    maxHeight: '80%',
    paddingTop: 20,
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
    alignItems: 'center',
  },
  createInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#FF0000',
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
  cancelButton: {
    padding: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
  },
  addButtonText: {
    fontSize: 16,
    color: '#FF0000',
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
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
    fontWeight: '600',
  },
  emptySubText: {
    marginTop: 8,
    fontSize: 14,
    color: '#ccc',
  },
  pinItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    marginBottom: 8,
  },
  pinItemSelected: {
    backgroundColor: '#fff3e0',
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  pinIcon: {
    marginRight: 12,
  },
  pinName: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  pinNameSelected: {
    fontWeight: '600',
    color: '#FF9800',
  },
});
