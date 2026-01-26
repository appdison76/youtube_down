package com.appdison76.app

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class MusicRecognitionServiceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String {
        return "MusicRecognitionService"
    }

    @ReactMethod
    fun startService() {
        // reactApplicationContext를 사용하여 Context 가져오기
        val context = reactApplicationContext
        MusicRecognitionService.startService(context)
    }

    @ReactMethod
    fun stopService() {
        // reactApplicationContext를 사용하여 Context 가져오기
        val context = reactApplicationContext
        MusicRecognitionService.stopService(context)
    }
}
