package com.appdison76.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(savedInstanceState)
    
    // 공유하기 intent 처리
    handleShareIntent(intent)
  }
  
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleShareIntent(intent)
  }
  
  private fun handleShareIntent(intent: Intent?) {
    if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
      val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
      if (sharedText != null && (sharedText.contains("youtube.com") || sharedText.contains("youtu.be"))) {
        // URL 추출 (텍스트에서 YouTube URL 찾기)
        var youtubeUrl = sharedText.trim()
        
        // 정규식으로 YouTube URL 추출
        val youtubePattern = java.util.regex.Pattern.compile(
          "(?:https?://)?(?:www\\.)?(?:youtube\\.com/watch\\?v=|youtu\\.be/)([a-zA-Z0-9_-]{11})[^\\s]*"
        )
        val matcher = youtubePattern.matcher(sharedText)
        if (matcher.find()) {
          val videoId = matcher.group(1)
          youtubeUrl = "https://www.youtube.com/watch?v=$videoId"
        } else {
          // 정규식으로 매칭되지 않으면 텍스트에서 URL 부분만 추출 시도
          val urlPattern = java.util.regex.Pattern.compile(
            "https?://[^\\s]+(?:youtube\\.com|youtu\\.be)[^\\s]*"
          )
          val urlMatcher = urlPattern.matcher(sharedText)
          if (urlMatcher.find()) {
            youtubeUrl = urlMatcher.group()
          }
        }
        
        // YouTube URL이 포함되어 있는지 확인
        if (youtubeUrl.contains("youtube.com") || youtubeUrl.contains("youtu.be")) {
          // expo-linking을 통해 React Native로 전달
          val linkingUri = Uri.parse("exp+app://?url=${Uri.encode(youtubeUrl)}")
          // intent의 data를 설정하여 expo-linking이 처리할 수 있도록 함
          intent.data = linkingUri
          intent.action = Intent.ACTION_VIEW
          intent.addCategory(Intent.CATEGORY_BROWSABLE)
          intent.addCategory(Intent.CATEGORY_DEFAULT)
        }
      }
    }
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

  // MediaProjection 권한 결과 처리 (내부 소리 캡처용)
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    
    // ACRCloudModule의 MediaProjection 요청 코드
    if (requestCode == 1000) { // REQUEST_CODE_MEDIA_PROJECTION
      Log.d("MainActivity", "MediaProjection result received: resultCode=$resultCode")
      
      // ACRCloudModule에 결과 전달
      try {
        // Companion object를 통해 인스턴스 접근
        val acrCloudModule = com.appdison76.acrcloud.ACRCloudModule.Companion.getInstance()
        if (acrCloudModule != null) {
          // setMediaProjectionResultInternal 함수 호출 (public 함수)
          try {
            acrCloudModule.setMediaProjectionResultInternal(resultCode, data)
            Log.d("MainActivity", "✅ MediaProjection result sent to ACRCloudModule")
          } catch (e: Exception) {
            Log.e("MainActivity", "Error calling setMediaProjectionResultInternal", e)
            e.printStackTrace()
          }
        } else {
          Log.w("MainActivity", "ACRCloudModule instance is null")
        }
      } catch (e: Exception) {
        Log.e("MainActivity", "Error handling MediaProjection result", e)
        e.printStackTrace()
      }
    }
  }
}
