import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { searchYouTubeVideos } from '../services/downloadService';
import { addFavorite, removeFavorite, isFavorite, initDatabase } from '../services/database';
import AdBanner from '../components/AdBanner';

export default function YouTubeSearchScreen({ navigation, route }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState(new Set()); // 즐겨찾기 ID Set

  // 데이터베이스 초기화
  useEffect(() => {
    initDatabase().catch(error => {
      console.error('[YouTubeSearchScreen] Failed to initialize database', error);
    });
  }, []);

  // 즐겨찾기 상태 확인
  const checkFavoritesStatus = useCallback(async () => {
    try {
      const favoriteIds = new Set();
      for (const item of results) {
        const isFav = await isFavorite(item.id);
        if (isFav) {
          favoriteIds.add(item.id);
        }
      }
      setFavorites(favoriteIds);
    } catch (error) {
      console.error('[YouTubeSearchScreen] Error checking favorites:', error);
    }
  }, [results]);

  // 검색 결과 변경 시 찜하기 상태 확인
  useEffect(() => {
    if (results.length > 0) {
      checkFavoritesStatus();
    }
  }, [results, checkFavoritesStatus]);

  // route.params에서 검색 결과 복원
  useEffect(() => {
    const savedResults = route?.params?.searchResults;
    const savedQuery = route?.params?.searchQuery;
    
    if (savedResults && Array.isArray(savedResults) && savedResults.length > 0) {
      setResults(savedResults);
      if (savedQuery) {
        setSearchQuery(savedQuery);
      }
    }
  }, [route?.params?.searchResults, route?.params?.searchQuery]);

  // 검색 실행
  const handleSearch = useCallback(async () => {
    if (searchQuery.trim() === '') {
      Alert.alert('알림', '검색어를 입력해주세요.');
      return;
    }

    try {
      setLoading(true);
      const searchResults = await searchYouTubeVideos(searchQuery.trim(), 20);
      
      // 검색 결과를 route.params에 저장
      navigation.setParams({
        searchQuery: searchQuery.trim(),
        searchResults: searchResults,
      });
      
      setResults(searchResults);
      setLoading(false);
    } catch (error) {
      console.error('[YouTubeSearchScreen] Search error:', error);
      
      // 제한 초과 에러 처리
      if (error.message && error.message.includes('오늘의 검색 요청 횟수')) {
        Alert.alert(
          '검색 제한',
          '오늘의 검색 요청 횟수가 모두 소진되었습니다.\n\n다운로드 화면을 이용하여 유튜브 영상을 가져오기하세요.',
          [
            { text: '취소', style: 'cancel' },
            { 
              text: '다운로드 화면으로 이동', 
              onPress: () => {
                const tabNav = navigation.getParent();
                if (tabNav) {
                  tabNav.navigate('Search');
                }
              }
            }
          ]
        );
      } else {
        Alert.alert('검색 오류', error.message || '검색 중 오류가 발생했습니다.');
      }
      setLoading(false);
    }
  }, [searchQuery, navigation]);

  // 찜하기 토글
  const handleToggleFavorite = async (item) => {
    try {
      const isFav = favorites.has(item.id);
      
      if (isFav) {
        await removeFavorite(item.id);
        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(item.id);
          return newSet;
        });
        console.log('[YouTubeSearchScreen] Favorite removed:', item.id);
      } else {
        await addFavorite({
          id: item.id,
          title: item.title,
          url: item.url,
          thumbnail: item.thumbnail,
          author: item.author,
          authorUrl: item.authorUrl,
        });
        setFavorites(prev => new Set(prev).add(item.id));
        console.log('[YouTubeSearchScreen] Favorite added:', item.id);
      }
    } catch (error) {
      console.error('[YouTubeSearchScreen] Error toggling favorite:', error);
      Alert.alert('오류', '찜하기 처리 중 오류가 발생했습니다.');
    }
  };

  // 영상 선택 (다운로드 화면으로 이동)
  const handleSelectVideo = (item) => {
    if (!item.url) {
      Alert.alert('오류', 'YouTube URL을 찾을 수 없습니다.');
      return;
    }

    try {
      const youtubeUrl = item.url;
      console.log('[YouTubeSearchScreen] Navigating to Search with URL:', youtubeUrl);
      
      const params = {
        url: youtubeUrl,
        timestamp: Date.now(),
        forceUpdate: true,
        forceReload: true,
      };
      
      // Stack Navigator를 통해 Main 스크린의 Search 탭으로 navigate
      const tabNav = navigation.getParent(); // Tab Navigator
      const stackNav = tabNav?.getParent(); // Stack Navigator
      if (stackNav) {
        stackNav.navigate('Main', {
          screen: 'Search',
          params: params,
        });
      } else {
        navigation.navigate('Search', params);
      }
    } catch (error) {
      console.error('[YouTubeSearchScreen] Error navigating to Search:', error);
      Alert.alert('오류', '영상으로 이동하는 중 오류가 발생했습니다.');
    }
  };

  // 데이터 배열에 광고 삽입 (5개마다)
  const getDataWithAds = () => {
    if (results.length === 0) {
      return [];
    }
    
    const result = [];
    // 첫 번째 항목 추가
    result.push(results[0]);
    
    // 첫 번째 항목 다음에 광고 추가
    if (results.length > 0) {
      result.push({ type: 'ad', id: 'ad-bottom' });
    }
    
    // 나머지 항목들을 5개마다 광고 삽입
    for (let i = 1; i < results.length; i++) {
      result.push(results[i]);
      // 5개마다 광고 삽입 (인덱스 1, 6, 11, ... 이후)
      if ((i - 1) % 5 === 4) {
        result.push({ type: 'ad', id: `ad-${i}` });
      }
    }
    
    return result;
  };

  const renderSearchItem = ({ item }) => {
    // 광고 아이템인 경우
    if (item.type === 'ad') {
      return <AdBanner style={{ marginVertical: 10 }} />;
    }
    
    const isFav = favorites.has(item.id);
    
    return (
      <TouchableOpacity 
        style={styles.searchItem}
        onPress={() => handleSelectVideo(item)}
        activeOpacity={0.8}
      >
        {item.thumbnail && (
          <Image 
            source={{ uri: item.thumbnail }} 
            style={styles.searchThumbnail}
            resizeMode="cover"
          />
        )}
        <View style={styles.searchContent}>
          <Text style={styles.searchTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {item.author && (
            <Text style={styles.searchAuthor} numberOfLines={1}>
              {item.author}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.favoriteButton}
          onPress={(e) => {
            e.stopPropagation();
            handleToggleFavorite(item);
          }}
        >
          <Ionicons 
            name={isFav ? "star" : "star-outline"} 
            size={24} 
            color={isFav ? "#FFD700" : "#999"} 
          />
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
              // X 버튼과 동일하게 초기화
              setSearchQuery('');
              setResults([]);
              navigation.setParams({
                searchQuery: '',
                searchResults: [],
              });
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
            placeholder="YouTube 검색어 입력"
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                setSearchQuery('');
                setResults([]);
                navigation.setParams({
                  searchQuery: '',
                  searchResults: [],
                });
              }}
            >
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity 
          style={[styles.searchButton, loading && styles.searchButtonDisabled]} 
          onPress={handleSearch}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.searchButtonText}>검색</Text>
          )}
        </TouchableOpacity>
        {results.length === 0 && !loading && (
          <Text style={styles.searchHintText}>
            검색어를 입력하고 검색 버튼을 누르면 YouTube 영상을 찾을 수 있습니다
          </Text>
        )}
      </View>

      {loading && results.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FF0000" />
          <Text style={styles.loadingText}>검색 중...</Text>
        </View>
      ) : (
        <FlatList
          data={getDataWithAds()}
          renderItem={renderSearchItem}
          keyExtractor={(item, index) => item.type === 'ad' ? item.id : (item.id || `search-${index}`)}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Ionicons name="search-outline" size={64} color="#ddd" />
              <Text style={styles.emptyText}>
                {searchQuery ? '검색 결과가 없습니다' : 'YouTube 영상 검색'}
              </Text>
              <Text style={styles.emptySubText}>
                {searchQuery ? '다른 검색어를 시도해보세요' : '검색어를 입력하면 YouTube 영상을 찾을 수 있습니다.\n찜하기 버튼으로 즐겨찾기에 추가하고,\n영상을 선택하면 다운로드 화면으로 이동합니다.'}
              </Text>
            </View>
          }
          contentContainerStyle={results.length === 0 ? styles.listContentEmpty : styles.listContent}
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 48,
    marginBottom: 12,
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
  searchButton: {
    backgroundColor: '#FF0000',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonDisabled: {
    opacity: 0.6,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  searchHintText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 8,
    lineHeight: 18,
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
    marginTop: 12,
  },
  listContent: {
    padding: 16,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  searchItem: {
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
  searchThumbnail: {
    width: 120,
    height: 90,
    backgroundColor: '#ddd',
  },
  searchContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  searchTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  searchAuthor: {
    fontSize: 14,
    color: '#666',
  },
  favoriteButton: {
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

