import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  InteractionManager,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { searchYouTubeVideos, getYouTubeAutocomplete } from '../services/downloadService';
import { addFavorite, removeFavorite, isFavorite, initDatabase } from '../services/database';
import AdBanner from '../components/AdBanner';
import LanguageSelector from '../components/LanguageSelector';

// 검색 이력 저장 키
const SEARCH_HISTORY_KEY = 'youtube_search_history';
const AUTCOMPLETE_ENABLED_KEY = 'youtube_autocomplete_enabled';
const MAX_HISTORY = 1000; // 최대 1000개 저장

export default function YouTubeSearchScreen({ navigation, route }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState(new Set()); // 즐겨찾기 ID Set
  const [suggestions, setSuggestions] = useState([]); // 자동완성 제안 목록
  const [showSuggestions, setShowSuggestions] = useState(false); // 자동완성 표시 여부
  const [searchHistory, setSearchHistory] = useState([]); // 로컬 검색 이력
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(true); // 자동완성 활성화 여부
  const autocompleteTimerRef = useRef(null); // 디바운싱 타이머

  // 데이터베이스 초기화 및 검색 이력 로드
  useEffect(() => {
    initDatabase().catch(error => {
      console.error('[YouTubeSearchScreen] Failed to initialize database', error);
    });
    
    // 검색 이력 로드
    loadSearchHistory();
    
    // 자동완성 설정 로드
    loadAutocompleteSetting();
  }, []);

  // 검색 이력 로드
  const loadSearchHistory = useCallback(async () => {
    try {
      const historyJson = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
      if (historyJson) {
        const history = JSON.parse(historyJson);
        setSearchHistory(Array.isArray(history) ? history : []);
      }
    } catch (error) {
      console.error('[YouTubeSearchScreen] Error loading search history:', error);
    }
  }, []);

  // 자동완성 설정 로드
  const loadAutocompleteSetting = useCallback(async () => {
    try {
      const enabled = await AsyncStorage.getItem(AUTCOMPLETE_ENABLED_KEY);
      if (enabled !== null) {
        setAutocompleteEnabled(enabled === 'true');
      }
    } catch (error) {
      console.error('[YouTubeSearchScreen] Error loading autocomplete setting:', error);
    }
  }, []);

  // 자동완성 설정 저장
  const saveAutocompleteSetting = useCallback(async (enabled) => {
    try {
      await AsyncStorage.setItem(AUTCOMPLETE_ENABLED_KEY, enabled.toString());
      setAutocompleteEnabled(enabled);
    } catch (error) {
      console.error('[YouTubeSearchScreen] Error saving autocomplete setting:', error);
    }
  }, []);

  // 검색어 저장 (검색 실행 시 호출)
  const saveSearchQuery = useCallback(async (query) => {
    if (!query || query.trim().length === 0) return;
    
    try {
      const trimmedQuery = query.trim();
      let history = [...searchHistory];
      
      // 중복 제거 (기존 항목이 있으면 제거)
      const index = history.indexOf(trimmedQuery);
      if (index > -1) {
        history.splice(index, 1);
      }
      
      // 맨 앞에 추가
      history.unshift(trimmedQuery);
      
      // 1000개 초과 시 가장 오래된 것 제거
      if (history.length > MAX_HISTORY) {
        history = history.slice(0, MAX_HISTORY);
      }
      
      // 저장
      await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
      setSearchHistory(history);
    } catch (error) {
      console.error('[YouTubeSearchScreen] Error saving search query:', error);
    }
  }, [searchHistory]);

  // 검색 이력에서 특정 항목 삭제
  const removeSearchHistoryItem = useCallback(async (query) => {
    try {
      const trimmedQuery = query.trim();
      let history = [...searchHistory];
      
      // 해당 항목 제거
      const index = history.indexOf(trimmedQuery);
      if (index > -1) {
        history.splice(index, 1);
        
        // 저장
        await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
        setSearchHistory(history);
      }
    } catch (error) {
      console.error('[YouTubeSearchScreen] Error removing search history item:', error);
    }
  }, [searchHistory]);

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

  // 자동완성 로직 (하이브리드: 로컬 + 서버)
  useEffect(() => {
    // 자동완성이 비활성화되어 있으면 실행하지 않음
    if (!autocompleteEnabled) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // 이전 타이머 취소
    if (autocompleteTimerRef.current) {
      clearTimeout(autocompleteTimerRef.current);
    }

    const query = searchQuery.trim();
    
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // 1. 로컬 검색 이력 즉시 표시
    const localSuggestions = searchHistory
      .filter(h => h.toLowerCase().startsWith(query.toLowerCase()))
      .slice(0, 10); // 최대 10개
    
    if (localSuggestions.length > 0) {
      setSuggestions(localSuggestions.map(s => ({ text: s, isLocal: true })));
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
    }

    // 2. 서버에서 실시간 제안 가져오기 (디바운싱 300ms)
    autocompleteTimerRef.current = setTimeout(async () => {
      // 자동완성이 비활성화되어 있으면 실행하지 않음
      if (!autocompleteEnabled) {
        return;
      }

      try {
        const serverSuggestions = await getYouTubeAutocomplete(query);
        
        // 로컬에 없는 제안만 추가
        const newSuggestions = serverSuggestions
          .filter(s => !searchHistory.includes(s))
          .slice(0, 10); // 최대 10개
        
        // 로컬 + 서버 합치기 (중복 제거)
        const allSuggestions = [
          ...localSuggestions.map(s => ({ text: s, isLocal: true })),
          ...newSuggestions.map(s => ({ text: s, isLocal: false }))
        ];
        
        setSuggestions(allSuggestions);
        setShowSuggestions(true);
      } catch (error) {
        console.error('[YouTubeSearchScreen] Error getting autocomplete:', error);
        // 에러가 나도 로컬 제안은 유지
      }
    }, 300);

    // cleanup
    return () => {
      if (autocompleteTimerRef.current) {
        clearTimeout(autocompleteTimerRef.current);
      }
    };
  }, [searchQuery, searchHistory, autocompleteEnabled]);

  // 검색 실행
  const handleSearch = useCallback(async () => {
    if (searchQuery.trim() === '') {
      Alert.alert('알림', '검색어를 입력해주세요.');
      return;
    }

    // 자동완성 숨기기
    setShowSuggestions(false);

    try {
      setLoading(true);
      const trimmedQuery = searchQuery.trim();
      
      // 검색어 저장
      await saveSearchQuery(trimmedQuery);
      
      const searchResults = await searchYouTubeVideos(trimmedQuery, 20);
      
      // 검색 결과를 route.params에 저장
      navigation.setParams({
        searchQuery: trimmedQuery,
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
                // Alert가 완전히 닫힌 후 navigation 호출
                InteractionManager.runAfterInteractions(() => {
                  try {
                    navigation.navigate('Search');
                  } catch (error) {
                    console.error('[YouTubeSearchScreen] Error navigating to Search:', error);
                  }
                });
              }
            }
          ]
        );
      } else {
        Alert.alert('검색 오류', error.message || '검색 중 오류가 발생했습니다.');
      }
      setLoading(false);
    }
  }, [searchQuery, navigation, saveSearchQuery]);

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

  // YouTube에서 영상 열기
  const openYouTubeVideo = useCallback(async (item) => {
    if (!item.url) {
      Alert.alert('오류', 'YouTube URL을 찾을 수 없습니다.');
      return;
    }

    try {
      const youtubeUrl = item.url;
      console.log('[YouTubeSearchScreen] Opening YouTube video:', youtubeUrl);

      if (Platform.OS === 'android') {
        // Android: YouTube 앱으로 열기 시도
        const videoId = youtubeUrl.match(/[?&]v=([^&]+)/)?.[1];
        if (videoId) {
          const youtubeAppUrl = `vnd.youtube:${videoId}`;
          try {
            const canOpen = await Linking.canOpenURL(youtubeAppUrl);
            if (canOpen) {
              await Linking.openURL(youtubeAppUrl);
              return;
            }
          } catch (e) {
            console.log('[YouTubeSearchScreen] YouTube app not available, using web');
          }
        }
      } else if (Platform.OS === 'ios') {
        // iOS: YouTube 앱으로 열기 시도
        const videoId = youtubeUrl.match(/[?&]v=([^&]+)/)?.[1];
        if (videoId) {
          const youtubeAppUrl = `youtube://watch?v=${videoId}`;
          try {
            const canOpen = await Linking.canOpenURL(youtubeAppUrl);
            if (canOpen) {
              await Linking.openURL(youtubeAppUrl);
              return;
            }
          } catch (e) {
            console.log('[YouTubeSearchScreen] YouTube app not available, using web');
          }
        }
      }

      // YouTube 앱이 없으면 웹 브라우저로 열기
      await Linking.openURL(youtubeUrl);
    } catch (error) {
      console.error('[YouTubeSearchScreen] Error opening YouTube video:', error);
      Alert.alert('오류', 'YouTube를 열 수 없습니다.');
    }
  }, []);

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
        <View style={styles.searchItemActions}>
          <TouchableOpacity
            style={styles.playButton}
            onPress={(e) => {
              e.stopPropagation();
              openYouTubeVideo(item);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="play-circle" size={24} color="#FF0000" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={(e) => {
              e.stopPropagation();
              handleToggleFavorite(item);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons 
              name={isFav ? "star" : "star-outline"} 
              size={24} 
              color={isFav ? "#FFD700" : "#999"} 
            />
          </TouchableOpacity>
        </View>
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
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>MeTube</Text>
          </View>
          <LanguageSelector />
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
          <TouchableOpacity
            style={styles.autocompleteToggleButton}
            onPress={() => saveAutocompleteSetting(!autocompleteEnabled)}
          >
            <Ionicons 
              name={autocompleteEnabled ? "bulb" : "bulb-outline"} 
              size={20} 
              color={autocompleteEnabled ? "#4CAF50" : "#999"} 
            />
          </TouchableOpacity>
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                setSearchQuery('');
                setResults([]);
                setShowSuggestions(false);
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
            <Text style={styles.searchButtonText}>검색하기</Text>
          )}
        </TouchableOpacity>
        {results.length === 0 && !loading && (
          <Text style={styles.searchHintText}>
            검색어를 입력하고 검색 버튼을 누르면 YouTube 영상을 찾을 수 있습니다
          </Text>
        )}
      </View>

      {/* 자동완성 목록 */}
      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <FlatList
            data={suggestions}
            keyExtractor={(item, index) => `suggestion-${index}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.suggestionItem}
                onPress={async () => {
                  const trimmedQuery = item.text.trim();
                  setSearchQuery(trimmedQuery);
                  setShowSuggestions(false);
                  
                  // 검색어 저장 및 검색 실행
                  if (trimmedQuery) {
                    await saveSearchQuery(trimmedQuery);
                    // 검색 실행 (searchQuery state가 업데이트되기 전이므로 직접 검색)
                    try {
                      setLoading(true);
                      const searchResults = await searchYouTubeVideos(trimmedQuery, 20);
                      navigation.setParams({
                        searchQuery: trimmedQuery,
                        searchResults: searchResults,
                      });
                      setResults(searchResults);
                      setLoading(false);
                    } catch (error) {
                      console.error('[YouTubeSearchScreen] Search error:', error);
                      if (error.message && error.message.includes('오늘의 검색 요청 횟수')) {
                        Alert.alert(
                          '검색 제한',
                          '오늘의 검색 요청 횟수가 모두 소진되었습니다.\n\n다운로드 화면을 이용하여 유튜브 영상을 가져오기하세요.',
                          [
                            { text: '취소', style: 'cancel' },
                            { 
                              text: '다운로드 화면으로 이동', 
                              onPress: () => {
                                InteractionManager.runAfterInteractions(() => {
                                  try {
                                    navigation.navigate('Search');
                                  } catch (error) {
                                    console.error('[YouTubeSearchScreen] Error navigating to Search:', error);
                                  }
                                });
                              }
                            }
                          ]
                        );
                      } else {
                        Alert.alert('검색 오류', error.message || '검색 중 오류가 발생했습니다.');
                      }
                      setLoading(false);
                    }
                  }
                }}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name={item.isLocal ? "time-outline" : "search-outline"} 
                  size={18} 
                  color={item.isLocal ? "#FF6B6B" : "#999"} 
                  style={styles.suggestionIcon}
                />
                <Text style={styles.suggestionText} numberOfLines={1}>
                  {item.text}
                </Text>
                {item.isLocal && (
                  <>
                    <Text style={styles.suggestionLabel}>최근 검색</Text>
                    <TouchableOpacity
                      style={styles.suggestionDeleteButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        removeSearchHistoryItem(item.text);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close-circle" size={20} color="#999" />
                    </TouchableOpacity>
                  </>
                )}
              </TouchableOpacity>
            )}
            nestedScrollEnabled={true}
          />
        </View>
      )}

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
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
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
  autocompleteToggleButton: {
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
  suggestionsContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    maxHeight: 200,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionIcon: {
    marginRight: 12,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  suggestionLabel: {
    fontSize: 11,
    color: '#999',
    marginLeft: 8,
  },
  suggestionDeleteButton: {
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
  searchItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    gap: 8,
  },
  playButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoriteButton: {
    padding: 8,
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

