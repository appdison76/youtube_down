import React, { useState, useEffect } from 'react';
import { Platform, Linking, NativeEventEmitter, NativeModules, AppState, Alert, PermissionsAndroid } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { initDatabase } from './src/services/database';
import { LanguageProvider } from './src/contexts/LanguageContext';
import Constants from 'expo-constants';

// YouTube URL인지 확인하는 함수
const isValidYouTubeUrl = (url) => {
  if (!url) return false;
  // 개발 서버 URL 무시
  if (url.includes('127.0.0.1') || url.includes('localhost') || url.includes(':8082')) {
    return false;
  }
  // exp://, exp+app:// 스킴은 처리하되, 내부 URL 파라미터 확인
  if (url.startsWith('exp://') || url.startsWith('exp+app://')) {
    try {
      const urlObj = new URL(url);
      const urlParam = urlObj.searchParams.get('url');
      if (urlParam) {
        return urlParam.includes('youtube.com') || urlParam.includes('youtu.be');
      }
    } catch (e) {
      // URL 파싱 실패 시 무시
    }
    return false;
  }
  // YouTube URL 확인
  return url.includes('youtube.com') || url.includes('youtu.be');
};

export default function App() {
  const [initialUrl, setInitialUrl] = useState(null);
  const [shouldRedirectToInstall, setShouldRedirectToInstall] = useState(false);

  // 데이터베이스 초기화
  useEffect(() => {
    initDatabase().catch(error => {
      console.error('[App] Database initialization error:', error);
    });
  }, []);

  // 마이크 권한 요청 (앱 시작 시) - 제거: 음악 인식 화면에서 요청하도록 변경
  // useEffect(() => {
  //   ... 권한 요청 코드 제거
  // }, []);

  // ✅ 강제 업데이트 체크
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const VERSION_URL = 'https://appdison76.github.io/youtube_down/install-page/version.json';
        const currentVersion = Constants.expoConfig?.version || '1.0.4';
        
        console.log('[App] Checking version update...');
        console.log('[App] Current app version:', currentVersion);
        
        const urlWithCacheBust = `${VERSION_URL}?t=${Date.now()}`;
        const response = await fetch(urlWithCacheBust, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Accept': 'application/json',
            'User-Agent': 'MelodySnap-App/1.0',
          },
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          console.warn('[App] Version fetch failed:', response.status, response.statusText, text?.slice(0, 200));
          return;
        }

        const rawText = await response.text();
        let versionInfo;
        try {
          versionInfo = JSON.parse(rawText);
        } catch (parseErr) {
          console.warn('[App] Version JSON parse error:', parseErr?.message, rawText?.slice(0, 200));
          return;
        }
        console.log('[App] Server version info:', versionInfo);

        if (versionInfo.minVersion && versionInfo.updateUrl) {
          // 버전 비교 함수
          const compareVersions = (v1, v2) => {
            const parts1 = v1.split('.').map(Number);
            const parts2 = v2.split('.').map(Number);
            for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
              const part1 = parts1[i] || 0;
              const part2 = parts2[i] || 0;
              if (part1 < part2) return -1;
              if (part1 > part2) return 1;
            }
            return 0;
          };

          // 현재 버전이 minVersion보다 낮으면 강제 업데이트
          if (compareVersions(currentVersion, versionInfo.minVersion) < 0) {
            console.log('[App] ⚠️ Update required! Current:', currentVersion, 'Min:', versionInfo.minVersion);
            
            Alert.alert(
              '업데이트 필요',
              versionInfo.message || '새로운 버전이 있습니다. 업데이트가 필요합니다.',
              [
                {
                  text: '업데이트',
                  onPress: () => {
                    const updateUrl = versionInfo.updateUrl || 'https://appdison76.github.io/youtube_down/web-app/install-page/';
                    Linking.openURL(updateUrl).catch(err => {
                      console.error('[App] Failed to open update URL:', err);
                    });
                  },
                },
              ],
              { cancelable: false }
            );
            
            // 자동으로 설치 페이지로 리다이렉트
            setTimeout(() => {
              const updateUrl = versionInfo.updateUrl || 'https://appdison76.github.io/youtube_down/web-app/install-page/';
              Linking.openURL(updateUrl).catch(err => {
                console.error('[App] Failed to open update URL:', err);
              });
            }, 1000);
            
            setShouldRedirectToInstall(true);
          } else {
            console.log('[App] ✅ Version is up to date');
          }
        }
      } catch (error) {
        console.error('[App] Error checking version:', error?.message || error, error?.cause);
        // 버전 체크 실패는 앱 실행을 막지 않음
      }
    };

    checkVersion();
  }, []);

  useEffect(() => {
    // Deep Linking: 앱이 완전히 종료된 상태에서 링크로 실행될 때
    // MainActivity에서 intent 처리가 완료되도록 여러 번 시도
    const checkInitialURL = (attempt = 0) => {
      Linking.getInitialURL()
        .then((url) => {
          console.log(`[App] [Attempt ${attempt}] Initial URL:`, url);
          if (url) {
            // YouTube URL인지 확인
            if (isValidYouTubeUrl(url)) {
              console.log('[App] Valid YouTube URL found:', url);
              setInitialUrl(url);
            } else {
              console.log('[App] Ignoring non-YouTube URL:', url);
              // YouTube URL이 아니면 무시하고 재시도하지 않음
              if (attempt === 0) {
                // 첫 시도에서만 로그 출력
                console.log('[App] No valid YouTube URL found, skipping...');
              }
            }
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
        // YouTube URL인지 확인
        if (isValidYouTubeUrl(url)) {
          // 이전 URL을 초기화한 후 새 URL 설정 (강제 업데이트)
          setInitialUrl(null);
          setTimeout(() => {
            setInitialUrl(`${url}?t=${Date.now()}`);
          }, 100);
        } else {
          console.log('[App] Ignoring non-YouTube URL from event listener:', url);
        }
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
              if (url && url !== lastProcessedUrl && isValidYouTubeUrl(url)) {
                console.log('[App] Found new YouTube URL when app became active:', url);
                lastProcessedUrl = url;
                setInitialUrl(null);
                setTimeout(() => {
                  setInitialUrl(`${url}?t=${Date.now()}`);
                }, 100);
              } else if (url === lastProcessedUrl) {
                console.log('[App] Same URL as before, ignoring (likely returning from external app)');
              } else if (url && !isValidYouTubeUrl(url)) {
                console.log('[App] Ignoring non-YouTube URL when app became active:', url);
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

  // 강제 업데이트가 필요한 경우 빈 화면 표시 (리다이렉트 중)
  if (shouldRedirectToInstall) {
    return null;
  }

  return (
    <LanguageProvider>
      <AppNavigator initialUrl={initialUrl} />
    </LanguageProvider>
  );
}
