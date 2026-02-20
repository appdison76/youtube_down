package com.appdison76.app.pro

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log

import com.appdison76.shareurl.ShareUrlHolder
import com.appdison76.shareurl.ShareUrlModule
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme)
    super.onCreate(null)
    handleShareIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleShareIntent(intent)
  }

  private fun handleShareIntent(intent: Intent?) {
    if (intent?.action != Intent.ACTION_SEND) return
    val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim() ?: return
    Log.d("ShareIntent", "EXTRA_TEXT raw: [$text]")
    if (text.isEmpty()) return
    val url = extractUrl(text) ?: return
    Log.d("ShareIntent", "extractUrl result: [$url]")
    ShareUrlHolder.pendingUrl = url
    ShareUrlModule.notifySharedUrl(url)
  }

  private fun extractUrl(text: String): String? {
    // URL만 골라내기 (공백·괄호·따옴표 등 앞뒤 텍스트 무시)
    val urlPattern = Regex("(https?://[a-zA-Z0-9\\-._~:/?#\\[\\]@!$&'()*+,;=]+)")
    val match = urlPattern.find(text) ?: return null
    val url = match.value
    return url.takeIf { url.contains("youtube") || url.contains("youtu.be") }
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
