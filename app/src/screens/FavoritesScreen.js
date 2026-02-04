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
import { 
  getFavorites, 
  removeFavorite, 
  initDatabase,
  getPins,
  assignPinToFavorite,
  removePinFromFavorite,
  deletePin,
  updatePinName,
  createPin,
} from '../services/database';
import { deleteThumbnailCacheIfUnused } from '../services/downloadService';
import AdBanner from '../components/AdBanner';
import HeaderTitle from '../components/HeaderTitle';
import PinManagerModal from '../components/PinManagerModal';
import PinSelectorModal from '../components/PinSelectorModal';
import { useLanguage } from '../contexts/LanguageContext';
import LanguageSelector from '../components/LanguageSelector';
import { translations } from '../locales/translations';

export default function FavoritesScreen({ navigation }) {
  const { currentLanguage } = useLanguage();
  const t = translations[currentLanguage];
  const [favorites, setFavorites] = useState([]);
  const [filteredFavorites, setFilteredFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date-desc'); // 'date-desc' | 'date-asc' | 'title-asc' | 'title-desc' | null
  const [showFilters, setShowFilters] = useState(false); // 필터/정렬 섹션 표시 여부
  const [pinFilter, setPinFilter] = useState(null); // null: 전체, 'none': 안 묶음, pin_id: 특정 핀
  const [pins, setPins] = useState([]);
  const [showPinManager, setShowPinManager] = useState(false);
  const [showPinSelector, setShowPinSelector] = useState(false);
  const [selectedItemForPin, setSelectedItemForPin] = useState(null);
  const [selectedPinIds, setSelectedPinIds] = useState([]); // 선택된 핀 ID 목록

  // 즐겨찾기 목록 로드
  const loadFavorites = useCallback(async () => {
    try {
      setLoading(true);
      const favs = await getFavorites();
      setFavorites(favs);
      console.log('[FavoritesScreen] Loaded favorites:', favs.length);
    } catch (error) {
      console.error('[FavoritesScreen] Error loading favorites:', error);
      Alert.alert(t.error, t.favoritesLoadError);
    } finally {
      setLoading(false);
    }
  }, []);

  // 핀 목록 로드
  const loadPins = useCallback(async () => {
    try {
      const pinsList = await getPins();
      setPins(pinsList);
      console.log('[FavoritesScreen] Loaded pins:', pinsList.length);
    } catch (error) {
      console.error('[FavoritesScreen] Error loading pins:', error);
    }
  }, []);

  // 데이터베이스 초기화
  useEffect(() => {
    initDatabase().then(() => {
      loadFavorites();
      loadPins();
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

  // 핀 목록이 변경될 때 현재 필터가 유효한지 확인
  useEffect(() => {
    if (pinFilter && pins.length > 0) {
      // 현재 필터가 존재하는 핀인지 확인
      const pinExists = pins.some(pin => pin.pin_id === pinFilter);
      if (!pinExists) {
        // 필터가 존재하지 않는 핀을 가리키면 전체로 리셋
        setPinFilter(null);
      }
    } else if (pinFilter && pins.length === 0) {
      // 핀이 모두 삭제되었으면 필터 리셋
      setPinFilter(null);
    }
  }, [pins, pinFilter]);

  // 검색/필터 및 정렬
  useEffect(() => {
    let filtered = [...favorites];
    
    // 핀 필터링
    if (pinFilter) {
      filtered = filtered.filter(fav => {
        const pinIds = fav.pin_ids || (fav.pin_id ? [fav.pin_id] : []);
        return pinIds.includes(pinFilter);
      });
    }
    // pinFilter === null이면 전체 표시
    
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
    
    // 핀 필터가 선택된 상태에서 해당 핀의 파일이 모두 제거되면 필터 리셋
    if (pinFilter && filtered.length === 0) {
      setPinFilter(null);
    }
    
    setFilteredFavorites(filtered);
  }, [searchQuery, favorites, sortBy, pinFilter]);

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
      setSortBy('title-desc'); // 가나다 역순
    } else if (sortBy === 'title-desc') {
      setSortBy('title-asc'); // 가나다 순
    } else {
      setSortBy('title-asc'); // 가나다 순
    }
  };

  const handleRemoveFavorite = async (item) => {
    try {
      await removeFavorite(item.video_id);
      setFavorites(prev => prev.filter(fav => fav.video_id !== item.video_id));
      console.log('[FavoritesScreen] Favorite removed:', item.video_id);
      
      // 썸네일 캐시 스마트 삭제 (다운로드 파일이 없을 때만 삭제)
      await deleteThumbnailCacheIfUnused(item.video_id);
      
      // 핀 목록 새로고침
      loadPins();
    } catch (error) {
      console.error('[FavoritesScreen] Error removing favorite:', error);
      Alert.alert(t.error, t.favoritesDeleteError);
    }
  };

  // 핀 관리 핸들러
  const handlePinCreate = async (pinName) => {
    try {
      await createPin(pinName);
      await loadPins();
      Alert.alert(t.complete, t.bookmarkGroupCreated);
    } catch (error) {
      console.error('[FavoritesScreen] Error creating pin:', error);
      Alert.alert(t.error, t.bookmarkGroupCreateError);
    }
  };

  const handlePinUpdate = async (pinId, newPinName) => {
    try {
      await updatePinName(pinId, newPinName);
      await loadPins();
      await loadFavorites(); // 즐겨찾기 목록도 새로고침 (pin_name 업데이트 반영)
      Alert.alert(t.complete, t.bookmarkGroupRenamed);
    } catch (error) {
      console.error('[FavoritesScreen] Error updating pin:', error);
      Alert.alert(t.error, t.bookmarkGroupRenameError);
    }
  };

  const handlePinDelete = async (pinId) => {
    try {
      await deletePin(pinId);
      // 삭제된 핀이 현재 필터인지 확인하고 먼저 제거
      if (pinFilter === pinId) {
        setPinFilter(null);
      }
      await loadPins();
      await loadFavorites(); // 즐겨찾기 목록도 새로고침
      Alert.alert(t.complete, t.bookmarkGroupDeleted);
    } catch (error) {
      console.error('[FavoritesScreen] Error deleting pin:', error);
      Alert.alert(t.error, t.bookmarkGroupDeleteError);
    }
  };

  const handlePinToggle = (pinId, isSelected) => {
    setSelectedPinIds(prev => {
      if (isSelected) {
        return [...prev, pinId];
      } else {
        return prev.filter(id => id !== pinId);
      }
    });
  };

  const handlePinSelect = async () => {
    if (!selectedItemForPin) return;
    
    try {
      // 핀 목록을 먼저 새로고침 (새로 생성된 핀 포함)
      await loadPins();
      
      // 최신 핀 목록 가져오기
      const latestPins = await getPins();
      
      // 선택된 핀 ID로 핀 데이터 배열 생성
      const pinDataArray = selectedPinIds.map(pinId => {
        const pin = latestPins.find(p => p.pin_id === pinId);
        if (!pin) {
          console.warn('[FavoritesScreen] Pin not found in local state, ID:', pinId);
          return null;
        }
        return {
          pin_id: pin.pin_id,
          pin_name: pin.pin_name
        };
      }).filter(p => p !== null && p.pin_name && p.pin_name.trim() !== ''); // 유효한 것만 필터링
      
      if (pinDataArray.length === 0) {
        // 선택된 핀이 없으면 기존 관계만 제거
        await assignPinToFavorite(selectedItemForPin.video_id, []);
      } else {
        await assignPinToFavorite(selectedItemForPin.video_id, pinDataArray);
      }
      
      await loadFavorites();
      await loadPins();
      setSelectedItemForPin(null);
      setSelectedPinIds([]);
    } catch (error) {
      console.error('[FavoritesScreen] Error assigning pins:', error);
      Alert.alert(t.error, t.bookmarkGroupAssignError);
    }
  };

  const handlePinSelectorCreate = async (pinName) => {
    if (!selectedItemForPin) return;
    
    try {
      // 핀 생성
      const pinId = await createPin(pinName);
      
      // 선택된 핀 목록에 추가
      setSelectedPinIds(prev => [...prev, pinId]);
      
      // 핀 목록 새로고침
      await loadPins();
    } catch (error) {
      console.error('[FavoritesScreen] Error creating pin:', error);
      Alert.alert(t.error, t.bookmarkGroupCreateError);
    }
  };

  const handleOpenVideo = (item) => {
    if (!item.url) {
      Alert.alert(t.error, t.ytUrlError);
      return;
    }

    try {
      const videoUrl = item.url;
      console.log('[FavoritesScreen] Navigating to Search with URL:', videoUrl);
      
      const params = {
        url: videoUrl,
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
      Alert.alert(t.error, t.navigateError);
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
      <View style={styles.favoriteItemWrapper}>
        {item.pin_names && item.pin_names.length > 0 && (
          <View style={styles.pinBadgesContainer}>
            {item.pin_names.map((pinName, idx) => (
              <View key={idx} style={styles.pinBadge}>
                <Ionicons name="bookmark" size={12} color="#ff6b6b" />
                <Text style={styles.pinBadgeText}>{pinName}</Text>
              </View>
            ))}
          </View>
        )}
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
            <View style={styles.favoriteTitleRow}>
              <Text style={styles.favoriteTitle} numberOfLines={2}>
                {item.title}
              </Text>
            </View>
            {item.author && (
              <Text style={styles.favoriteAuthor} numberOfLines={1}>
                {item.author}
              </Text>
            )}
          </View>
          <View style={styles.favoriteActions}>
          <TouchableOpacity
            style={styles.pinButton}
            onPress={(e) => {
              e.stopPropagation();
              setSelectedItemForPin(item);
              setSelectedPinIds(item.pin_ids || []);
              setShowPinSelector(true);
            }}
          >
            <Ionicons 
              name={(item.pin_ids && item.pin_ids.length > 0) ? "bookmark" : "bookmark-outline"} 
              size={20} 
              color={(item.pin_ids && item.pin_ids.length > 0) ? "#ff6b6b" : "#999"} 
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={(e) => {
              e.stopPropagation();
              handleRemoveFavorite(item);
            }}
          >
            <Ionicons name="close-circle" size={24} color="#999" />
          </TouchableOpacity>
        </View>
        </TouchableOpacity>
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
              // 음악 찾기 화면으로 이동
              navigation.navigate('MusicRecognition');
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
            <HeaderTitle title={t.appTitle} />
          </View>
          <TouchableOpacity
            style={styles.headerPinButton}
            onPress={() => setShowPinManager(true)}
          >
            <Ionicons 
              name="bookmark" 
              size={24} 
              color="#fff" 
            />
          </TouchableOpacity>
          <LanguageSelector />
        </View>
      </SafeAreaView>

      {/* 검색바 */}
      {!loading && (
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={t.searchPlaceholderFavorites || t.searchPlaceholder}
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

      {/* 찜하기그룹 필터 버튼 */}
      {showFilters && !loading && (() => {
        // 실제로 파일이 있는 핀만 필터링
        const pinsWithFiles = pins.filter(pin => {
          return favorites.some(fav => {
            const pinIds = fav.pin_ids || (fav.pin_id ? [fav.pin_id] : []);
            return pinIds.includes(pin.pin_id);
          });
        });
        
        if (pinsWithFiles.length === 0) return null;
        
        return (
          <View style={styles.filterSection}>
            <TouchableOpacity
              style={[
                styles.pinFilterButton,
                pinFilter === null && styles.filterButtonActive
              ]}
              onPress={() => setPinFilter(null)}
            >
              <Text style={[
                styles.filterButtonText,
                pinFilter === null && styles.filterButtonTextActive
              ]}>
                {t.all}
              </Text>
            </TouchableOpacity>
            {pinsWithFiles.map((pin) => (
              <TouchableOpacity
                key={pin.pin_id}
                style={[
                  styles.pinFilterButton,
                  pinFilter === pin.pin_id && styles.filterButtonActive
                ]}
                onPress={() => setPinFilter(pin.pin_id)}
              >
                <Ionicons 
                  name="bookmark" 
                  size={14} 
                  color={pinFilter === pin.pin_id ? '#fff' : '#666'} 
                  style={{ marginRight: 4 }}
                />
                <Text style={[
                  styles.filterButtonText,
                  pinFilter === pin.pin_id && styles.filterButtonTextActive
                ]} 
                numberOfLines={1}
                ellipsizeMode="tail"
                >
                  {pin.pin_name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      })()}

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
              {sortBy === 'date-desc' ? t.newest : sortBy === 'date-asc' ? t.oldest : t.newest}
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
              {t.titleSort}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>{t.loading}</Text>
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
                {searchQuery ? t.noResults : t.noFavorites}
              </Text>
              <Text style={styles.emptySubText}>
                {searchQuery ? t.tryDifferentQuery : t.favoriteHint}
              </Text>
            </View>
          }
          contentContainerStyle={filteredFavorites.length === 0 ? styles.listContentEmpty : styles.listContent}
        />
      )}

      {/* 핀 관리 모달 */}
      <PinManagerModal
        visible={showPinManager}
        onClose={() => setShowPinManager(false)}
        pins={pins}
        onPinCreate={handlePinCreate}
        onPinUpdate={handlePinUpdate}
        onPinDelete={handlePinDelete}
        labelType="bookmark"
        files={favorites}
      />

      {/* 핀 선택 모달 */}
      <PinSelectorModal
        visible={showPinSelector}
        onClose={async () => {
          await handlePinSelect();
          setShowPinSelector(false);
          setSelectedItemForPin(null);
          setSelectedPinIds([]);
        }}
        pins={pins}
        currentPinIds={selectedPinIds}
        onPinSelect={handlePinToggle}
        onPinCreate={handlePinSelectorCreate}
        onPinUpdate={handlePinUpdate}
        labelType="bookmark"
      />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FF0000',
    borderBottomWidth: 1,
    borderBottomColor: '#cc0000',
  },
  logoContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 44,
    height: 44,
    resizeMode: 'cover',
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  headerPinButton: {
    marginRight: 8,
    padding: 4,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchSection: {
    padding: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterButton: {
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
  pinFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  filterButtonActive: {
    backgroundColor: '#ff6b6b',
    borderColor: '#ff6b6b',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
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
  favoriteItemWrapper: {
    marginBottom: 12,
  },
  favoriteItem: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
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
  favoriteTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  favoriteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  pinBadgesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  pinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3f3',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  pinBadgeText: {
    fontSize: 11,
    color: '#ff6b6b',
    fontWeight: '600',
  },
  favoriteAuthor: {
    fontSize: 14,
    color: '#666',
  },
  favoriteActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
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
