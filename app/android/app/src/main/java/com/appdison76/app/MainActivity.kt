package com.appdison76.app

import android.os.Build
import android.os.Bundle
import android.content.Intent
import android.util.Log
import android.net.Uri

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  companion object {
    private const val TAG = "MainActivity"
  }
  
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
    
    // 초기 intent 처리 (앱이 종료된 상태에서 공유로 실행될 때)
    handleIntent(intent)
  }
  
  // 앱이 이미 실행 중일 때 새로운 intent 처리 (공유하기)
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent) // 새로운 intent로 업데이트
    handleIntent(intent)
  }
  
  // Intent 처리 (공유하기 또는 URL 열기)
  private fun handleIntent(intent: Intent?) {
    if (intent == null) return
    
    Log.d(TAG, "Handling intent: ${intent.action}")
    Log.d(TAG, "Intent data: ${intent.dataString}")
    Log.d(TAG, "Intent extras: ${intent.extras}")
    
    when (intent.action) {
      Intent.ACTION_SEND -> {
        // 텍스트 공유 (YouTube URL 포함)
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)
        if (text != null) {
          Log.d(TAG, "Received shared text: $text")
          // YouTube URL인지 확인
          if (text.contains("youtube.com") || text.contains("youtu.be")) {
            Log.d(TAG, "YouTube URL detected, sending to React Native")
            sendUrlToReactNative(text)
          }
        }
      }
      Intent.ACTION_VIEW -> {
        // URL 직접 열기
        val data = intent.data
        if (data != null) {
          val url = data.toString()
          Log.d(TAG, "Received URL: $url")
          if (url.contains("youtube.com") || url.contains("youtu.be")) {
            Log.d(TAG, "YouTube URL detected, sending to React Native")
            sendUrlToReactNative(url)
          }
        }
      }
    }
  }
  
  // React Native로 URL 전달
  private fun sendUrlToReactNative(url: String) {
    try {
      // React Native의 Linking API를 통해 URL 전달
      // expo-linking이 자동으로 처리하지만, 명시적으로 처리
      Log.d(TAG, "Sending URL to React Native: $url")
      
      // React Native가 준비될 때까지 대기 후 URL 전달
      // 실제로는 Linking.getInitialURL()이나 Linking.addEventListener()가 처리함
      // 여기서는 로그만 남기고, 실제 처리는 App.js의 Linking 이벤트 리스너가 처리
    } catch (e: Exception) {
      Log.e(TAG, "Error sending URL to React Native: ${e.message}", e)
    }
  }
  
  // 백그라운드 서비스 시작/중지 메서드 (React Native에서 호출 가능하도록)
  fun startMusicRecognitionService() {
    MusicRecognitionService.startService(this)
  }
  
  fun stopMusicRecognitionService() {
    MusicRecognitionService.stopService(this)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
