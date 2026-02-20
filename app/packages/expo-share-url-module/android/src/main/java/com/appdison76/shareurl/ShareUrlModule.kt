package com.appdison76.shareurl

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ShareUrlModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("ShareUrlModule")
    Events("onSharedUrl")

    OnCreate {
      Companion.instance = this@ShareUrlModule
      ShareUrlHolder.takePendingUrl()?.let { url ->
        sendEvent("onSharedUrl", mapOf("url" to url))
      }
    }

    OnDestroy {
      Companion.instance = null
    }

    Function("getInitialShareUrl") {
      ShareUrlHolder.takePendingUrl()?.let { return@Function it }
      val activity = appContext.currentActivity ?: return@Function null
      val intent = activity.intent ?: return@Function null
      if (Intent.ACTION_SEND != intent.action) return@Function null
      val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim() ?: return@Function null
      if (text.isEmpty() || !isLikelyUrl(text)) return@Function null
      text
    }
  }

  private fun isLikelyUrl(s: String): Boolean {
    return s.startsWith("http://") || s.startsWith("https://") ||
      s.contains("youtube.com") || s.contains("youtu.be")
  }

  companion object {
    @Volatile
    var instance: ShareUrlModule? = null

    @JvmStatic
    fun notifySharedUrl(url: String) {
      instance?.sendEvent("onSharedUrl", mapOf("url" to url))
    }
  }
}
