import React, { useState } from 'react';
import { View, StyleSheet, Text, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { useLanguage } from '../contexts/LanguageContext';

const { width } = Dimensions.get('window');

export default function AdBanner({ style }) {
  const { currentLanguage } = useLanguage();
  const [adLoaded, setAdLoaded] = useState(false);
  const [adFailed, setAdFailed] = useState(false);
  
  // 한국어일 때는 쿠팡 광고, 그 외에는 구글 애드몹
  const isKorean = currentLanguage === 'ko';

  if (isKorean) {
    // 모바일용 쿠팡파트너스 배너 - iframe 방식 (테두리 없음)
    const bannerWidth = Math.min(width - 32, 320);
  const coupangBannerHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-src https://ads-partners.coupang.com;">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #fff;
    }
    .coupang-banner-container {
      width: 100%;
      height: 140px;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #fff;
    }
    .coupang-iframe {
      width: ${bannerWidth}px;
      height: 140px;
      border: none;
      display: block;
      margin: 0 auto;
      background: #fff;
    }
  </style>
</head>
<body>
  <div class="coupang-banner-container">
    <iframe
      src="https://ads-partners.coupang.com/widgets.html?id=956091&template=carousel&trackingCode=AF3962095&subId=&width=${bannerWidth}&height=140&tsource="
      width="${bannerWidth}"
      height="140"
      frameborder="0"
      scrolling="no"
      referrerpolicy="unsafe-url"
      allow="browsing-topics"
      class="coupang-iframe"
      style="border: none; outline: none;"
    ></iframe>
  </div>
</body>
</html>
  `;

    return (
      <View style={[styles.container, style]}>
        <Text style={styles.disclaimer}>
          이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
        </Text>
        <View style={styles.webviewContainer}>
          <WebView
            source={{ html: coupangBannerHTML }}
            style={styles.webview}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            scalesPageToFit={true}
            bounces={false}
            mixedContentMode="always"
            allowsInlineMediaPlayback={true}
            originWhitelist={['*']}
            allowsBackForwardNavigationGestures={false}
            userAgent="Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36"
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error('[AdBanner] WebView error: ', nativeEvent);
              console.error('[AdBanner] Error URL: ', nativeEvent.url);
              console.error('[AdBanner] Error description: ', nativeEvent.description);
            }}
            onHttpError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error('[AdBanner] WebView HTTP error: ', nativeEvent);
              console.error('[AdBanner] HTTP status code: ', nativeEvent.statusCode);
            }}
            onLoadEnd={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.log('[AdBanner] WebView loaded, URL: ', nativeEvent.url);
              console.log('[AdBanner] WebView canGoBack: ', nativeEvent.canGoBack);
              console.log('[AdBanner] WebView canGoForward: ', nativeEvent.canGoForward);
            }}
            onLoadStart={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.log('[AdBanner] WebView loading started, URL: ', nativeEvent.url);
            }}
            onShouldStartLoadWithRequest={(request) => {
              console.log('[AdBanner] Should start load with request: ', request.url);
              // about:blank는 초기 로드를 위해 허용
              if (request.url === 'about:blank' || request.url.startsWith('data:') || request.url.startsWith('file://')) {
                return true;
              }
              // 쿠팡 도메인 허용
              if (request.url.includes('ads-partners.coupang.com') || request.url.includes('coupang.com')) {
                return true;
              }
              // 다른 링크는 차단
              return false;
            }}
            onMessage={(event) => {
              console.log('[AdBanner] WebView message: ', event.nativeEvent.data);
            }}
          />
        </View>
      </View>
    );
  } else {
    // 구글 애드몹 (영어 등 다른 언어) - 테스트 ID 사용
    // 쿠팡 광고와 비슷한 크기로 맞춤 (320x50)
    // 광고가 실패하면 아무것도 표시하지 않음
    if (adFailed) {
      return null;
    }
    
    return (
      <View style={[styles.container, styles.admobContainer, style]}>
        <View style={styles.admobWrapper}>
          <BannerAd
            unitId={TestIds.BANNER}
            size={BannerAdSize.BANNER}
            requestOptions={{
              requestNonPersonalizedAdsOnly: true,
            }}
            style={styles.admobBannerStyle}
            onAdLoaded={() => {
              console.log('[AdBanner] AdMob banner ad loaded');
              setAdLoaded(true);
            }}
            onAdFailedToLoad={(error) => {
              console.error('[AdBanner] AdMob banner ad failed to load:', error);
              setAdFailed(true);
            }}
          />
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minHeight: 180,
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  disclaimer: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginBottom: 8,
  },
  webviewContainer: {
    width: '100%',
    height: 140,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  webview: {
    width: '100%',
    height: 140,
    backgroundColor: 'transparent',
  },
  admobContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 50,
    backgroundColor: '#fff',
    paddingVertical: 0,
    paddingHorizontal: 0,
    overflow: 'visible',
  },
  admobWrapper: {
    width: 320,
    height: 50,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
    borderRadius: 0,
    borderWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
  },
  admobBannerStyle: {
    backgroundColor: '#fff',
    width: 320,
    height: 50,
    alignSelf: 'center',
  },
});
