import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  Linking,
  Alert,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getFavorites, removeFavorite, initDatabase } from '../services/database';
import { deleteThumbnailCacheIfUnused } from '../services/downloadService';
import AdBanner from '../components/AdBanner';

export default function FavoritesScreen({ navigation }) {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  // 즐겨찾기 목록 로드
  const loadFavorites = useCallback(async () => {
    try {
      setLoading(true);
      const favs = await getFavorites();
      setFavorites(favs);
      console.log('[FavoritesScreen] Loaded favorites:', favs.length);
    } catch (error) {
      console.error('[FavoritesScreen] Error loading favorites:', error);
      Alert.alert('오류', '즐겨찾기 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 데이터베이스 초기화
  useEffect(() => {
    initDatabase().then(() => {
      loadFavorites();
    }).catch(error => {
      console.error('[FavoritesScreen] Failed to initialize database', error);
    });
  }, []);

  // 화면 포커스 시 즐겨찾기 목록 새로고침
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadFavorites();
    });

    return unsubscribe;
  }, [navigation, loadFavorites]);

  const handleRemoveFavorite = async (item) => {
    try {
      await removeFavorite(item.video_id);
      setFavorites(prev => prev.filter(fav => fav.video_id !== item.video_id));
      console.log('[FavoritesScreen] Favorite removed:', item.video_id);
      
      // ✅ 썸네일 캐시 스마트 삭제 (다운로드 파일이 없을 때만 삭제)
      await deleteThumbnailCacheIfUnused(item.video_id);
    } catch (error) {
      console.error('[FavoritesScreen] Error removing favorite:', error);
      Alert.alert('오류', '즐겨찾기 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleOpenVideo = (item) => {
    if (!item.url) {
      Alert.alert('오류', 'YouTube URL을 찾을 수 없습니다.');
      return;
    }

    try {
      const youtubeUrl = item.url;
      console.log('[FavoritesScreen] Navigating to Search with URL:', youtubeUrl);
      
      const params = {
        url: youtubeUrl,
        timestamp: Date.now(),
        forceUpdate: true,
        forceReload: true, // 강제 리로드로 이전 결과 초기화
      };
      
      // Stack Navigator를 통해 Main 스크린의 Search 탭으로 navigate
      // 구조: Stack.Navigator -> Main (Tab.Navigator) -> Search
      // Tab Navigator에서 Stack Navigator에 접근하려면 getParent()를 두 번 호출
      const tabNav = navigation.getParent(); // Tab Navigator
      const stackNav = tabNav?.getParent(); // Stack Navigator
      if (stackNav) {
        // Stack Navigator를 통해 Main -> Search로 navigate
        stackNav.navigate('Main', {
          screen: 'Search',
          params: params,
        });
      } else {
        // fallback: 직접 navigate 시도 (Tab Navigator에서 직접)
        navigation.navigate('Search', params);
      }
    } catch (error) {
      console.error('[FavoritesScreen] Error navigating to Search:', error);
      Alert.alert('오류', '영상으로 이동하는 중 오류가 발생했습니다.');
    }
  };

  // 데이터 배열에 광고 삽입 (5개마다)
  const getDataWithAds = () => {
    if (favorites.length === 0) {
      return [];
    }
    
    const result = [];
    // 첫 번째 항목 추가
    result.push(favorites[0]);
    
    // 첫 번째 항목 다음에 광고 추가 (하단에 표시되도록)
    if (favorites.length > 0) {
      result.push({ type: 'ad', id: 'ad-bottom' });
    }
    
    // 나머지 항목들을 5개마다 광고 삽입
    for (let i = 1; i < favorites.length; i++) {
      result.push(favorites[i]);
      // 5개마다 광고 삽입 (인덱스 1, 6, 11, ... 이후)
      if ((i - 1) % 5 === 4) {
        result.push({ type: 'ad', id: `ad-${i}` });
      }
    }
    
    return result;
  };

  const renderFavoriteItem = ({ item }) => {
    // 광고 아이템인 경우
    if (item.type === 'ad') {
      return <AdBanner style={{ marginVertical: 10 }} />;
    }
    
    return (
      <TouchableOpacity 
        style={styles.favoriteItem}
        onPress={() => handleOpenVideo(item)}
        activeOpacity={0.8}
      >
        {item.thumbnail && (
          <Image 
            source={{ uri: item.thumbnail }} 
            style={styles.favoriteThumbnail}
            resizeMode="cover"
          />
        )}
        <View style={styles.favoriteContent}>
          <Text style={styles.favoriteTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {item.author && (
            <Text style={styles.favoriteAuthor} numberOfLines={1}>
              {item.author}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={(e) => {
            e.stopPropagation();
            handleRemoveFavorite(item);
          }}
        >
          <Ionicons name="close-circle" size={24} color="#999" />
        </TouchableOpacity>
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

      {loading ? (
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>로딩 중...</Text>
        </View>
      ) : (
        <FlatList
          data={getDataWithAds()}
          renderItem={renderFavoriteItem}
          keyExtractor={(item, index) => item.type === 'ad' ? item.id : (item.video_id || `favorite-${index}`)}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Ionicons name="star-outline" size={64} color="#ddd" />
              <Text style={styles.emptyText}>즐겨찾기가 없습니다</Text>
              <Text style={styles.emptySubText}>비디오를 찜하여 저장하세요</Text>
            </View>
          }
          contentContainerStyle={favorites.length === 0 ? styles.listContentEmpty : styles.listContent}
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  listContent: {
    padding: 16,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  favoriteItem: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  favoriteThumbnail: {
    width: 120,
    height: 90,
    backgroundColor: '#ddd',
  },
  favoriteContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  favoriteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  favoriteAuthor: {
    fontSize: 14,
    color: '#666',
  },
  removeButton: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});
