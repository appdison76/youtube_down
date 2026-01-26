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
    super.onCreate(savedInstanceState)
    
    // 초기 intent 처리 (앱이 종료된 상태에서 공유로 실행될 때)
    handleShareIntent(intent)
  }
  
  // 앱이 이미 실행 중일 때 새로운 intent 처리 (공유하기)
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent) // 새로운 intent로 업데이트
    handleShareIntent(intent)
  }
  
  // 공유하기 Intent 처리 (YouTube URL을 deep link로 변환)
  private fun handleShareIntent(intent: Intent?) {
    if (intent == null) return
    
    if (intent.action == Intent.ACTION_SEND) {
      val text = intent.getStringExtra(Intent.EXTRA_TEXT)
      if (text != null) {
        Log.d(TAG, "Received shared text: $text")
        
        // YouTube URL 추출
        val youtubeUrlPattern = Regex("(https?://)?(www\\.)?(youtube\\.com/watch\\?v=|youtu\\.be/)([a-zA-Z0-9_-]+)")
        val match = youtubeUrlPattern.find(text)
        
        if (match != null) {
          val videoId = match.groupValues[4]
          val fullUrl = match.value
          
          Log.d(TAG, "YouTube URL detected: $fullUrl")
          Log.d(TAG, "Video ID: $videoId")
          
          // Deep link 형식으로 변환
          val deepLinkUrl = "exp+app://?url=${Uri.encode(fullUrl)}"
          Log.d(TAG, "Converting to deep link: $deepLinkUrl")
          
          // Intent를 deep link로 변환하여 expo-linking이 처리하도록 함
          intent.data = Uri.parse(deepLinkUrl)
          intent.action = Intent.ACTION_VIEW
          intent.removeCategory(Intent.CATEGORY_DEFAULT)
          intent.addCategory(Intent.CATEGORY_BROWSABLE)
          
          Log.d(TAG, "Intent modified for deep linking")
        }
      }
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
