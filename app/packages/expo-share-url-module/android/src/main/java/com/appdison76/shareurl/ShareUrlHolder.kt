package com.appdison76.shareurl

object ShareUrlHolder {
  @Volatile
  var pendingUrl: String? = null

  @JvmStatic
  fun takePendingUrl(): String? {
    val url = pendingUrl
    pendingUrl = null
    return url
  }
}
