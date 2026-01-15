import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function MiniPlayer({ 
  isVisible,
  isPlaying,
  currentItem,
  currentIndex,
  totalItems,
  onPlayPause,
  onPrevious,
  onNext,
  onClose,
}) {
  if (!isVisible || !currentItem) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.info}>
          <Ionicons 
            name={currentItem.isVideo ? "videocam" : "musical-notes"} 
            size={16} 
            color={currentItem.isVideo ? "#FF0000" : "#4CAF50"} 
            style={styles.typeIcon}
          />
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {currentItem.title}
            </Text>
            <Text style={styles.subtitle}>
              {currentIndex + 1} / {totalItems}
            </Text>
          </View>
        </View>
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={onPrevious}
            disabled={currentIndex === 0}
          >
            <Ionicons 
              name="play-skip-back" 
              size={20} 
              color={currentIndex === 0 ? "#ccc" : "#333"} 
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.playButton}
            onPress={onPlayPause}
          >
            <Ionicons 
              name={isPlaying ? "pause" : "play"} 
              size={24} 
              color="#fff" 
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={onNext}
            disabled={currentIndex === totalItems - 1}
          >
            <Ionicons 
              name="play-skip-forward" 
              size={20} 
              color={currentIndex === totalItems - 1 ? "#ccc" : "#333"} 
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
          >
            <Ionicons name="close" size={20} color="#666" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  typeIcon: {
    marginRight: 8,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: '#999',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlButton: {
    padding: 8,
  },
  playButton: {
    backgroundColor: '#ff6b6b',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    padding: 8,
    marginLeft: 4,
  },
});






