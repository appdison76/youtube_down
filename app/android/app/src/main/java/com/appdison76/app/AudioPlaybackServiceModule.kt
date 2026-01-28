package com.appdison76.app

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AudioPlaybackServiceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AudioPlaybackService"

    @ReactMethod
    fun startService(title: String?, artist: String?) {
        val context = reactApplicationContext
        AudioPlaybackService.startService(context, title, artist)
    }

    @ReactMethod
    fun updateNotification(title: String?, artist: String?) {
        val context = reactApplicationContext
        AudioPlaybackService.updateNotification(context, title, artist)
    }

    @ReactMethod
    fun stopService() {
        val context = reactApplicationContext
        AudioPlaybackService.stopService(context)
    }
}
