import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
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
  const [filteredFavorites, setFilteredFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date-desc'); // 'date-desc' | 'date-asc' | 'title-asc' | 'title-desc' | null
  const [showFilters, setShowFilters] = useState(false); // 필터/정렬 섹션 표시 여부

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

  // 검색 필터링 및 정렬
  useEffect(() => {
    let filtered = [...favorites];
    
    // 검색 필터링
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(fav =>
        fav.title.toLowerCase().includes(query) ||
        (fav.author && fav.author.toLowerCase().includes(query))
      );
    }
    
    // 정렬
    if (sortBy) {
      if (sortBy.startsWith('date')) {
        // 날짜 정렬 (created_at 기준)
        filtered.sort((a, b) => {
          const timeA = new Date(a.created_at || 0).getTime();
          const timeB = new Date(b.created_at || 0).getTime();
          return sortBy === 'date-desc' ? timeB - timeA : timeA - timeB;
        });
      } else if (sortBy.startsWith('title')) {
        // 제목 정렬
        filtered.sort((a, b) => {
          const titleA = (a.title || '').toLowerCase();
          const titleB = (b.title || '').toLowerCase();
          const compare = titleA.localeCompare(titleB, 'ko');
          return sortBy === 'title-asc' ? compare : -compare;
        });
      }
    }
    
    setFilteredFavorites(filtered);
  }, [searchQuery, favorites, sortBy]);

  // 정렬 버튼 핸들러 (3단계 토글)
  const handleDateSort = () => {
    if (sortBy === 'date-desc') {
      setSortBy('date-asc'); // 오래된순
    } else if (sortBy === 'date-asc') {
      setSortBy('date-desc'); // 최신순 (기본값)
    } else {
      setSortBy('date-desc'); // 최신순
    }
  };

  const handleTitleSort = () => {
    if (sortBy === 'title-asc') {
      setSortBy('title-desc'); // 가나다 내림차순
    } else if (sortBy === 'title-desc') {
      setSortBy('title-asc'); // 가나다 오름차순
    } else {
      setSortBy('title-asc'); // 가나다 오름차순
    }
  };

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
    const dataToUse = filteredFavorites;
    if (dataToUse.length === 0) {
      return [];
    }
    
    const result = [];
    // 첫 번째 항목 추가
    result.push(dataToUse[0]);
    
    // 첫 번째 항목 다음에 광고 추가 (하단에 표시되도록)
    if (dataToUse.length > 0) {
      result.push({ type: 'ad', id: 'ad-bottom' });
    }
    
    // 나머지 항목들을 5개마다 광고 삽입
    for (let i = 1; i < dataToUse.length; i++) {
      result.push(dataToUse[i]);
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

      {/* 검색 바 */}
      {!loading && (
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="제목으로 검색..."
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

      {/* 정렬 버튼 */}
      {showFilters && !loading && (
        <View style={styles.sortSection}>
          <TouchableOpacity
            style={[
              styles.sortButton,
              (sortBy === 'date-desc' || sortBy === 'date-asc') && styles.sortButtonActive
            ]}
            onPress={handleDateSort}
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
              {sortBy === 'date-desc' ? '최신순' : sortBy === 'date-asc' ? '오래된순' : '최신순'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sortButton,
              (sortBy === 'title-asc' || sortBy === 'title-desc') && styles.sortButtonActive
            ]}
            onPress={handleTitleSort}
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
              제목순
            </Text>
          </TouchableOpacity>
        </View>
      )}

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
              <Text style={styles.emptyText}>
                {searchQuery ? '검색 결과가 없습니다' : '즐겨찾기가 없습니다'}
              </Text>
              <Text style={styles.emptySubText}>
                {searchQuery ? '다른 검색어를 시도해보세요' : '비디오를 찜하여 저장하세요'}
              </Text>
            </View>
          }
          contentContainerStyle={filteredFavorites.length === 0 ? styles.listContentEmpty : styles.listContent}
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
  logoIcon3D: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8, // Android
    transform: [{ rotateY: '15deg' }, { perspective: 1000 }],
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
  filterToggleButton: {
    padding: 4,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
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
