import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import SearchScreen from '../screens/SearchScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import DownloadsScreen from '../screens/DownloadsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Search') {
            iconName = focused ? 'download' : 'download-outline';
          } else if (route.name === 'Favorites') {
            iconName = focused ? 'star' : 'star-outline';
          } else if (route.name === 'Downloads') {
            iconName = focused ? 'folder' : 'folder-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#FF0000',
        tabBarInactiveTintColor: '#999',
        headerShown: false, // 커스텀 헤더 사용
      })}
    >
      <Tab.Screen 
        name="Search" 
        component={SearchScreen}
        options={{
          title: '다운로드',
        }}
      />
      <Tab.Screen 
        name="Downloads" 
        component={DownloadsScreen}
        options={{
          title: '내 파일',
        }}
      />
      <Tab.Screen 
        name="Favorites" 
        component={FavoritesScreen}
        options={{
          title: '찜하기',
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator({ initialUrl }) {
  const navigationRef = React.useRef();
  const [isReady, setIsReady] = React.useState(false);
  const lastProcessedUrl = React.useRef(null);
  const lastTimestamp = React.useRef(null);

  React.useEffect(() => {
    if (isReady && initialUrl) {
      // URL과 타임스탬프 추출
      const urlParts = initialUrl.split('?t=');
      const urlWithoutTimestamp = urlParts[0];
      const timestamp = urlParts[1] ? parseInt(urlParts[1]) : null;
      
      // 타임스탬프가 다르면 무조건 업데이트 (새로운 공유)
      const isNewShare = timestamp !== null && lastTimestamp.current !== timestamp;
      
      // 같은 URL이고 타임스탬프도 같으면 스킵 (단, 새로운 공유는 제외)
      if (!isNewShare && lastProcessedUrl.current === urlWithoutTimestamp && lastTimestamp.current === timestamp) {
        console.log('[AppNavigator] Same URL and timestamp, skipping:', urlWithoutTimestamp);
        return;
      }
      
      // 새 URL이면 이전 값 업데이트
      lastProcessedUrl.current = urlWithoutTimestamp;
      lastTimestamp.current = timestamp;
      try {
        console.log('[AppNavigator] Processing initialUrl:', initialUrl);

        let urlToNavigate = null;

        // initialUrl이 문자열인 경우
        if (typeof initialUrl === 'string') {
          urlToNavigate = initialUrl;
        }
        // initialUrl이 객체인 경우 (expo-linking에서 받은 경우)
        else if (initialUrl && initialUrl.url) {
          urlToNavigate = initialUrl.url;
        }

        if (urlToNavigate) {
          console.log('[AppNavigator] Navigating to Search with URL:', urlToNavigate);
          // URL 정리 (공백 제거)
          urlToNavigate = urlToNavigate.trim();
          
          // exp+app:// 스킴에서 실제 URL 추출
          if (urlToNavigate.startsWith('exp+app://') || urlToNavigate.startsWith('exp://')) {
            try {
              const urlObj = new URL(urlToNavigate);
              const urlParam = urlObj.searchParams.get('url');
              if (urlParam) {
                urlToNavigate = decodeURIComponent(urlParam);
                console.log('[AppNavigator] Extracted URL from exp+app://:', urlToNavigate);
              }
            } catch (e) {
              console.warn('[AppNavigator] Failed to parse exp+app:// URL:', e);
              // exp+app://?url= 형식에서 직접 추출 시도
              const urlMatch = urlToNavigate.match(/[?&]url=([^&]+)/);
              if (urlMatch) {
                urlToNavigate = decodeURIComponent(urlMatch[1]);
                console.log('[AppNavigator] Extracted URL using regex:', urlToNavigate);
              }
            }
          }
          
          // 잘린 URL 복구 시도
          if (urlToNavigate.startsWith(':om/') || urlToNavigate.startsWith('om/') || urlToNavigate.startsWith('be.com/')) {
            if (urlToNavigate.startsWith('be.com/')) {
              urlToNavigate = `https://www.youtu${urlToNavigate}`;
            } else {
              urlToNavigate = `https://www.youtub${urlToNavigate}`;
            }
            console.log('[AppNavigator] 잘린 URL 복구:', urlToNavigate);
          }
          
          // 불필요한 파라미터 제거 (v= 파라미터는 유지)
          const urlMatch = urlToNavigate.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s?]+)/);
          if (urlMatch) {
            const videoId = urlMatch[1].split('?')[0].split('&')[0]; // ?si= 같은 파라미터 제거
            urlToNavigate = `https://www.youtube.com/watch?v=${videoId}`;
            console.log('[AppNavigator] 정규화된 URL:', urlToNavigate);
          }
          
          // 강제로 네비게이션 (항상 새로운 파라미터로 업데이트)
          const newTimestamp = Date.now();
          const newParams = { url: urlToNavigate, timestamp: newTimestamp, forceUpdate: true };
          
          // 한 번만 navigate (깜빡임 방지)
          navigationRef.current?.navigate('Main', {
            screen: 'Search',
            params: newParams,
          });
        } else {
          console.log('[AppNavigator] No valid URL found in:', initialUrl);
        }
      } catch (error) {
        console.error('[AppNavigator] Deep linking navigation error:', error);
      }
    }
  }, [isReady, initialUrl]);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => setIsReady(true)}
    >
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen 
          name="Main" 
          component={MainTabs}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
