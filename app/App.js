import React, { useState, useEffect } from 'react';
import { Platform, Linking, NativeEventEmitter, NativeModules, AppState } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { initDatabase } from './src/services/database';

export default function App() {
  const [initialUrl, setInitialUrl] = useState(null);

  // 데이터베이스 초기화
  useEffect(() => {
    initDatabase().catch(error => {
      console.error('[App] Database initialization error:', error);
    });
  }, []);

  useEffect(() => {
    // Deep Linking: 앱이 완전히 종료된 상태에서 링크로 실행될 때
    // MainActivity에서 intent 처리가 완료되도록 여러 번 시도
    const checkInitialURL = (attempt = 0) => {
      Linking.getInitialURL()
        .then((url) => {
          console.log(`[App] [Attempt ${attempt}] Initial URL:`, url);
          if (url) {
            setInitialUrl(url);
          } else if (attempt < 10) {
            // 최대 10번까지 재시도 (공유하기로 받은 경우 MainActivity 처리 시간 필요)
            setTimeout(() => {
              checkInitialURL(attempt + 1);
            }, 300);
          } else {
            console.log('[App] No URL found after 10 attempts');
          }
        })
        .catch((error) => {
          console.error('[App] Deep linking error:', error);
          if (attempt < 10) {
            setTimeout(() => {
              checkInitialURL(attempt + 1);
            }, 300);
          }
        });
    };

    // 첫 시도는 약간의 지연 후 (MainActivity의 onCreate 완료 대기)
    setTimeout(() => checkInitialURL(0), 500);

    // Deep Linking: 앱이 실행 중일 때 링크를 받을 때
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url) {
        console.log('[App] Received URL from event listener:', url);
        // 이전 URL을 초기화한 후 새 URL 설정 (강제 업데이트)
        setInitialUrl(null);
        setTimeout(() => {
          setInitialUrl(`${url}?t=${Date.now()}`);
        }, 100);
      }
    });

    // Native Module을 통해 MainActivity에서 직접 전달받은 URL 처리
    let shareSubscription = null;
    if (Platform.OS === 'android' && NativeModules.ShareUrlModule) {
      const eventEmitter = new NativeEventEmitter(NativeModules.ShareUrlModule);
      shareSubscription = eventEmitter.addListener('onSharedUrl', (event) => {
        if (event && event.url) {
          console.log('[App] Received URL from ShareUrlModule:', event.url);
          // 이전 URL을 초기화한 후 새 URL 설정 (강제 업데이트)
          setInitialUrl(null);
          setTimeout(() => {
            setInitialUrl(`${event.url}?t=${Date.now()}`);
          }, 100);
        }
      });
    }

    // AppState 변경 감지 (앱이 포그라운드로 올 때)
    // 주의: 외부 앱(플레이어 등)에서 돌아올 때는 deep linking을 트리거하지 않도록 함
    let lastProcessedUrl = null;
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        console.log('[App] App became active, checking for new URL...');
        // 앱이 포그라운드로 올 때 Linking.getInitialURL() 다시 체크
        // 단, 이전에 처리한 URL과 같으면 무시 (외부 앱에서 돌아온 경우 방지)
        setTimeout(() => {
          Linking.getInitialURL()
            .then((url) => {
              if (url && url !== lastProcessedUrl) {
                console.log('[App] Found new URL when app became active:', url);
                lastProcessedUrl = url;
                setInitialUrl(null);
                setTimeout(() => {
                  setInitialUrl(`${url}?t=${Date.now()}`);
                }, 100);
              } else if (url === lastProcessedUrl) {
                console.log('[App] Same URL as before, ignoring (likely returning from external app)');
              }
            })
            .catch((error) => {
              console.error('[App] Error checking URL on app state change:', error);
            });
        }, 300);
      }
    });

    return () => {
      subscription.remove();
      if (shareSubscription) {
        shareSubscription.remove(); // Clean up native event listener
      }
      appStateSubscription.remove();
    };
  }, []);

  return <AppNavigator initialUrl={initialUrl} />;
}
