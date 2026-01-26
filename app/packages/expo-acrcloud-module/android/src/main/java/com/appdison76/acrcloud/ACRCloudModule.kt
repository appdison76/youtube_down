package com.appdison76.acrcloud

import android.util.Log
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.media.projection.MediaProjectionManager
import android.content.Intent
import android.app.Activity
import android.content.Context
import android.media.AudioRecord
import android.media.AudioFormat
import android.media.MediaRecorder
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import expo.modules.kotlin.events.EventsDefinition
import expo.modules.kotlin.AppContext
import org.json.JSONObject
import org.json.JSONArray

// ACRCloud SDK 클래스들
import com.acrcloud.rec.ACRCloudConfig
import com.acrcloud.rec.ACRCloudClient
import com.acrcloud.rec.IACRCloudListener
import com.acrcloud.rec.ACRCloudResult

class ACRCloudModule : Module() {
  private var isInitialized = false
  private var isRecognizing = false
  private var mClient: ACRCloudClient? = null
  private var mConfig: ACRCloudConfig? = null
  private var startTime: Long = 0
  private var useInternalAudio = false // 내부 소리 캡처 모드 여부
  private var mediaProjectionResultCode: Int = -1
  private var mMediaProjectionIntent: Intent? = null // MediaProjection Intent (네이티브에만 저장, JS로 전달 안 함)
  private var mediaProjectionPromise: Promise? = null // MediaProjection 권한 요청 Promise
  val REQUEST_CODE_MEDIA_PROJECTION = 1000 // MainActivity에서 접근 가능하도록 public
  
  companion object {
    @JvmStatic
    private var instance: ACRCloudModule? = null
    
    @JvmStatic
    fun getInstance(): ACRCloudModule? = instance
  }
  
  init {
    instance = this
    Log.d("ACRCloudModule", "ACRCloudModule instance created and registered")
  }

  override fun definition() = ModuleDefinition {
    Name("ACRCloudModule")

    Events("onRecognitionResult", "onRecognitionError", "onVolumeChanged")

    // 내부 소리 캡처 모드 설정
    AsyncFunction("setInternalAudioMode") { enabled: Boolean, promise: Promise ->
      try {
        useInternalAudio = enabled
        Log.d("ACRCloudModule", "Internal audio mode set to: $enabled")
        Log.d("ACRCloudModule", "Android version: ${Build.VERSION.SDK_INT} (API ${Build.VERSION.SDK_INT})")
        
        if (enabled && Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
          Log.w("ACRCloudModule", "⚠️ Internal audio capture requires Android 10 (API 29) or higher")
          Log.w("ACRCloudModule", "⚠️ Current version: ${Build.VERSION.SDK_INT}, falling back to microphone")
          useInternalAudio = false
          promise.resolve(false)
          return@AsyncFunction
        }
        
        promise.resolve(true)
      } catch (e: Exception) {
        Log.e("ACRCloudModule", "Error setting internal audio mode", e)
        promise.reject("SET_MODE_ERROR", "Failed to set internal audio mode: ${e.message}", e)
      }
    }

    // MediaProjection 권한 요청 (내부 소리 캡처용)
    AsyncFunction("requestMediaProjectionPermission") { promise: Promise ->
      try {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
          promise.reject("UNSUPPORTED", "MediaProjection requires Android 10 (API 29) or higher", null)
          return@AsyncFunction
        }

        val activity = appContext.activityProvider?.currentActivity
        if (activity == null) {
          promise.reject("NO_ACTIVITY", "Activity is null, cannot request MediaProjection permission", null)
          return@AsyncFunction
        }

        Log.d("ACRCloudModule", "Requesting MediaProjection permission...")
        mediaProjectionPromise = promise

        val mediaProjectionManager = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val captureIntent = mediaProjectionManager.createScreenCaptureIntent()
        
        // MainActivity에서 결과를 받을 수 있도록 Activity를 통해 시작
        // Expo Module에서는 직접 startActivityForResult를 호출할 수 없으므로
        // MainActivity에 요청을 전달해야 함
        Log.d("ACRCloudModule", "Starting MediaProjection permission request...")
        activity.startActivityForResult(captureIntent, REQUEST_CODE_MEDIA_PROJECTION)
        
        // 결과는 MainActivity의 onActivityResult에서 처리되어야 함
        // 여기서는 일단 요청만 시작
        Log.d("ACRCloudModule", "MediaProjection permission request started")
        // Promise는 MainActivity에서 결과를 받아서 resolve/reject 해야 함
        
      } catch (e: Exception) {
        Log.e("ACRCloudModule", "Error requesting MediaProjection permission", e)
        promise.reject("MEDIA_PROJECTION_ERROR", "Failed to request MediaProjection: ${e.message}", e)
        mediaProjectionPromise = null
      }
    }

    // MediaProjection 결과 설정 (MainActivity에서 호출)
    // Intent는 Expo Module에서 직접 처리할 수 없으므로, MainActivity에서 직접 호출하도록 함
    // JS에서는 호출 불가 (Intent 타입 변환 불가)

    // ACRCloud 초기화
    AsyncFunction("initialize") { accessKey: String, accessSecret: String, host: String, promise: Promise ->
      try {
        // Activity Context 강제 사용 (마이크 접근에 필수)
        // Application Context는 마이크 접근에 실패할 수 있으므로 Activity Context만 허용
        val activity = appContext.activityProvider?.currentActivity
        
        if (activity == null) {
          Log.e("ACRCloudModule", "❌ ❌ ❌ CRITICAL: Activity Context is null!")
          Log.e("ACRCloudModule", "❌ ACRCloud SDK requires Activity Context for microphone access")
          Log.e("ACRCloudModule", "❌ Cannot initialize with Application Context")
          Log.e("ACRCloudModule", "❌ Please ensure the app is in foreground and Activity is available")
          return@AsyncFunction promise.reject("CONTEXT_ERROR", "Activity Context is required but not available. Please ensure the app is in foreground.", null)
        }
        
        val context = activity as Context
        
        Log.d("ACRCloudModule", "Initializing ACRCloud with accessKey: $accessKey, host: $host")
        Log.d("ACRCloudModule", "✅ Context type: Activity (REQUIRED for microphone access)")
        Log.d("ACRCloudModule", "✅ Activity class: ${activity.javaClass.name}")
        
        // 마이크 권한 확인
        val hasPermission = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        Log.d("ACRCloudModule", "Microphone permission at init: $hasPermission")
        
        if (!hasPermission) {
          Log.e("ACRCloudModule", "❌ RECORD_AUDIO permission not granted at initialization!")
          Log.e("ACRCloudModule", "❌ Please request RECORD_AUDIO permission before initializing")
          return@AsyncFunction promise.reject("PERMISSION_DENIED", "Microphone permission not granted", null)
        }
        
        // 실제 마이크 접근 가능 여부 테스트 (권한만으로는 부족함)
        // Android 12+ 개인정보 보호 설정이나 다른 앱이 마이크를 점유 중일 수 있음
        Log.d("ACRCloudModule", "🔍 Testing actual microphone access...")
        var audioRecord: AudioRecord? = null
        try {
          val sampleRate = 44100
          val channelConfig = AudioFormat.CHANNEL_IN_MONO
          val audioFormat = AudioFormat.ENCODING_PCM_16BIT
          val bufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
          
          if (bufferSize == AudioRecord.ERROR_BAD_VALUE || bufferSize == AudioRecord.ERROR) {
            Log.e("ACRCloudModule", "❌ Invalid audio parameters for AudioRecord")
          } else {
            audioRecord = AudioRecord(
              MediaRecorder.AudioSource.MIC,
              sampleRate,
              channelConfig,
              audioFormat,
              bufferSize
            )
            
            if (audioRecord.state == AudioRecord.STATE_INITIALIZED) {
              Log.d("ACRCloudModule", "✅ AudioRecord initialized successfully - microphone is accessible")
              try {
                audioRecord.startRecording()
                Log.d("ACRCloudModule", "✅ AudioRecord.startRecording() succeeded - microphone is working!")
                audioRecord.stop()
              } catch (e: Exception) {
                Log.e("ACRCloudModule", "❌ AudioRecord.startRecording() failed: ${e.message}")
                Log.e("ACRCloudModule", "❌ This means microphone is blocked or in use by another app")
                Log.e("ACRCloudModule", "❌ Common causes:")
                Log.e("ACRCloudModule", "   1. Another app is using the microphone (phone call, voice recorder, etc.)")
                Log.e("ACRCloudModule", "   2. Android 12+ privacy setting: Settings > Privacy > Microphone access is OFF")
                Log.e("ACRCloudModule", "   3. System-level microphone restriction")
                audioRecord.release()
                audioRecord = null
                return@AsyncFunction promise.reject("MICROPHONE_BLOCKED", "Microphone is blocked or in use. Error: ${e.message}", e)
              }
            } else {
              Log.e("ACRCloudModule", "❌ AudioRecord initialization failed - state: ${audioRecord.state}")
              Log.e("ACRCloudModule", "❌ Microphone may be blocked or hardware issue")
              audioRecord.release()
              audioRecord = null
              return@AsyncFunction promise.reject("MICROPHONE_INIT_FAILED", "AudioRecord initialization failed. State: ${audioRecord?.state}", null)
            }
          }
        } catch (e: Exception) {
          Log.e("ACRCloudModule", "❌ Exception while testing microphone access: ${e.message}")
          Log.e("ACRCloudModule", "❌ This usually means:")
          Log.e("ACRCloudModule", "   1. Microphone hardware is not available")
          Log.e("ACRCloudModule", "   2. Another app has exclusive access to microphone")
          Log.e("ACRCloudModule", "   3. System-level restriction")
          audioRecord?.release()
          return@AsyncFunction promise.reject("MICROPHONE_TEST_FAILED", "Microphone access test failed: ${e.message}", e)
        } finally {
          audioRecord?.release()
        }
        
        Log.d("ACRCloudModule", "✅ Microphone access test passed - ready to initialize ACRCloud")
        
        try {
          mConfig = ACRCloudConfig().apply {
            this.acrcloudListener = object : IACRCloudListener {
              override fun onResult(results: ACRCloudResult?) {
                Log.d("ACRCloudModule", "🔔 onResult callback called! results: $results")
                handleRecognitionResult(results)
              }

              override fun onVolumeChanged(curVolume: Double) {
                // 볼륨이 0이 아닌지 확인 (마이크가 실제로 소리를 받고 있는지)
                if (curVolume > 0.0) {
                  Log.d("ACRCloudModule", "🔊 🔊 🔊 Volume changed: $curVolume (✅ Microphone IS receiving audio!)")
                  Log.d("ACRCloudModule", "🔊 Sending onVolumeChanged event to JS...")
                  sendEvent("onVolumeChanged", mapOf("volume" to curVolume))
                  Log.d("ACRCloudModule", "🔊 Event sent successfully!")
                } else {
                  // 볼륨이 0일 때는 로그만 출력하고 이벤트는 보내지 않음 (너무 많은 경고 방지)
                  // 백그라운드에서 다른 앱이 오디오를 재생하면 마이크 접근이 차단될 수 있음
                  // 이는 정상적인 동작이므로 경고를 줄임
                  Log.d("ACRCloudModule", "🔊 Volume changed: $curVolume (⚠️ Volume is 0 - may be background or mic blocked)")
                }
              }
            }
            // Activity Context 사용 (마이크 접근에 중요)
            this.context = context
            this.host = host
            this.accessKey = accessKey
            this.accessSecret = accessSecret
            this.recorderConfig.isVolumeCallback = true
            // 프리레코딩 버퍼를 최소화하여 앱 전환 시 잡음이 버퍼에 들어가는 것을 방지
            // 0으로 설정하면 버퍼 없이 실시간 오디오만 사용 (앱 전환 시 잡음 방지)
            this.recorderConfig.reservedRecordBufferMS = 0 // 0초 프리레코딩 (앱 전환 시 잡음 방지)
            
            // 오디오 샘플 레이트 명시적 설정 (표준 규격)
            // GPT나 제미나이 같은 앱들이 사용하는 표준 샘플 레이트
            // 8000은 너무 낮고, 44100이 표준이지만 ACRCloud SDK가 자동으로 설정할 수 있음
            // 명시적으로 설정할 수 있다면 설정하되, SDK가 자동으로 처리하는 경우도 있음
            Log.d("ACRCloudModule", "✅ Recorder config set - isVolumeCallback: true, reservedRecordBufferMS: 0 (no pre-recording buffer to prevent noise from app switching)")
            Log.d("ACRCloudModule", "✅ ACRCloud SDK will use standard audio sample rate (typically 44100 Hz)")
            
            // 오디오 소스 설정
            // 참고: ACRCloud SDK는 기본적으로 마이크 입력만 지원합니다
            // 내부 소리 캡처를 위해서는 Android의 AudioPlaybackCapture API를 직접 사용해야 할 수 있습니다
            if (useInternalAudio && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
              // Android 10+ 내부 소리 캡처 모드
              Log.d("ACRCloudModule", "✅ Audio source: INTERNAL (APP_PLAYBACK - phone's internal audio)")
              Log.d("ACRCloudModule", "✅ This will capture audio from YouTube, music apps, etc.")
              Log.d("ACRCloudModule", "⚠️ Note: User needs to grant screen recording permission")
              Log.d("ACRCloudModule", "⚠️ Note: ACRCloud SDK may not support APP_PLAYBACK directly")
              Log.d("ACRCloudModule", "⚠️ May need to use Android AudioPlaybackCapture API separately")
              
              // MediaProjection Intent가 저장되어 있으면 사용
              // ACRCloud SDK가 MediaProjection을 지원하는 경우를 대비
              if (mMediaProjectionIntent != null) {
                Log.d("ACRCloudModule", "✅ MediaProjection Intent available, will be used for internal audio capture")
                // ACRCloud SDK가 MediaProjection Intent를 지원하는 경우
                // this.recorderConfig.setMediaProjectionIntent(mMediaProjectionIntent) 같은 메서드가 있을 수 있음
                // 하지만 SDK 문서를 확인해야 함
                // 현재는 Intent를 저장만 하고, startRecognizing에서 사용
              } else {
                Log.w("ACRCloudModule", "⚠️ MediaProjection Intent not available yet (will be set when permission is granted)")
              }
            } else {
              // 마이크 입력 사용 (주변 소리 인식) - 기본 모드
              Log.d("ACRCloudModule", "✅ Audio source: MIC (microphone input for ambient sound)")
            }
            
            Log.d("ACRCloudModule", "✅ ACRCloudConfig created with Activity context")
          }

          mClient = ACRCloudClient()
          Log.d("ACRCloudModule", "=== Initializing ACRCloud Client ===")
          Log.d("ACRCloudModule", "Config details:")
          Log.d("ACRCloudModule", "  - Context: ${mConfig?.context} (${if (mConfig?.context is Activity) "Activity ✅" else "NOT Activity ❌"})")
          Log.d("ACRCloudModule", "  - isVolumeCallback: ${mConfig?.recorderConfig?.isVolumeCallback}")
          Log.d("ACRCloudModule", "  - reservedRecordBufferMS: ${mConfig?.recorderConfig?.reservedRecordBufferMS}")
          Log.d("ACRCloudModule", "  - Listener registered: ${mConfig?.acrcloudListener != null}")
          
          try {
            Log.d("ACRCloudModule", "Calling mClient.initWithConfig(mConfig)...")
            val initResult = mClient?.initWithConfig(mConfig)
            Log.d("ACRCloudModule", "initWithConfig returned: $initResult")
            
            if (initResult == true) {
              isInitialized = true
              Log.d("ACRCloudModule", "✅ ACRCloud initialized successfully")
              Log.d("ACRCloudModule", "✅ Context: Activity (required)")
              Log.d("ACRCloudModule", "✅ Volume callback: enabled")
              Log.d("ACRCloudModule", "✅ Listener: registered")
              Log.d("ACRCloudModule", "✅ Ready to start recognition")
              Log.d("ACRCloudModule", "🔊 When startRecognizing() is called, watch for 'Volume changed' logs")
              promise.resolve(true)
            } else {
              Log.e("ACRCloudModule", "❌ ACRCloud initialization failed - initWithConfig returned false")
              Log.e("ACRCloudModule", "❌ This usually means:")
              Log.e("ACRCloudModule", "   1. Invalid ACRCloud credentials")
              Log.e("ACRCloudModule", "   2. Context is not Activity context")
              Log.e("ACRCloudModule", "   3. Microphone permission issue")
              Log.e("ACRCloudModule", "   4. ACRCloud SDK internal error")
              promise.reject("INIT_ERROR", "Failed to initialize ACRCloud SDK", null)
            }
          } catch (e: Exception) {
            Log.e("ACRCloudModule", "❌ Exception during initWithConfig:", e)
            Log.e("ACRCloudModule", "❌ Exception message: ${e.message}")
            Log.e("ACRCloudModule", "❌ Exception class: ${e.javaClass.name}")
            e.printStackTrace()
            promise.reject("INIT_ERROR", "Exception during initialization: ${e.message}", e)
          }
        } catch (e: Exception) {
          Log.e("ACRCloudModule", "❌ Error initializing ACRCloud SDK", e)
          promise.reject("INIT_ERROR", "Failed to initialize ACRCloud: ${e.message}", e)
        }
      } catch (e: Exception) {
        Log.e("ACRCloudModule", "Error initializing ACRCloud", e)
        promise.reject("INIT_ERROR", "Failed to initialize ACRCloud: ${e.message}", e)
      }
    }

    // 음악 인식 시작
    AsyncFunction("startRecognizing") { promise: Promise ->
      try {
        // Activity Context 강제 사용 (마이크 접근에 필수)
        val activity = appContext.activityProvider?.currentActivity
        
        if (activity == null) {
          Log.e("ACRCloudModule", "❌ Activity Context is null in startRecognizing!")
          Log.e("ACRCloudModule", "❌ Cannot start recognition without Activity Context")
          return@AsyncFunction promise.reject("CONTEXT_ERROR", "Activity Context is required but not available", null)
        }
        
        val context = activity as Context
        
        if (!isInitialized) {
          return@AsyncFunction promise.reject("NOT_INITIALIZED", "ACRCloud is not initialized. Call initialize() first.", null)
        }
        
        // 이전 인식이 진행 중이면 먼저 취소 (버퍼/캐시 정리를 위해)
        if (isRecognizing) {
          Log.d("ACRCloudModule", "⚠️ Previous recognition in progress, cancelling first...")
          try {
            mClient?.cancel()
            Log.d("ACRCloudModule", "✅ Previous recognition cancelled")
            // reservedRecordBufferMS가 0이므로 버퍼 정리 대기 시간 최소화
            // 최소한의 대기로 성능 영향 최소화
            Log.d("ACRCloudModule", "⏳ Waiting 200ms to ensure clean audio buffer (reservedRecordBufferMS: 0ms)...")
            try {
              Thread.sleep(200)
            } catch (e: InterruptedException) {
              Log.w("ACRCloudModule", "⚠️ Sleep interrupted: ${e.message}")
            }
            isRecognizing = false
            Log.d("ACRCloudModule", "✅ Previous recognition fully stopped and buffer cleared")
          } catch (e: Exception) {
            Log.e("ACRCloudModule", "❌ Error cancelling previous recognition: ${e.message}", e)
            // 에러가 나도 계속 진행
            isRecognizing = false
          }
        }
        // 이전 인식이 없으면 대기하지 않음 (불필요한 지연 방지)
        
        Log.d("ACRCloudModule", "Starting music recognition...")
        Log.d("ACRCloudModule", "Context type: ${if (activity != null) "Activity" else "Application"}")
        Log.d("ACRCloudModule", "Internal audio mode: $useInternalAudio")
        
        if (mClient == null) {
          Log.e("ACRCloudModule", "❌ mClient is null!")
          return@AsyncFunction promise.reject("CLIENT_NULL", "ACRCloud client is null", null)
        }

        // 권한 확인
        val hasPermission: Boolean
        if (useInternalAudio && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          // 내부 소리 캡처 모드인 경우 MediaProjection 권한 확인
          Log.d("ACRCloudModule", "🔊 Internal audio mode: Checking MediaProjection permission...")
          
          if (mediaProjectionResultCode != Activity.RESULT_OK || mMediaProjectionIntent == null) {
            Log.e("ACRCloudModule", "❌ MediaProjection permission not granted!")
            Log.e("ACRCloudModule", "❌ resultCode: $mediaProjectionResultCode, intent: $mMediaProjectionIntent")
            Log.e("ACRCloudModule", "❌ Please call requestMediaProjectionPermission() first")
            promise.reject("MEDIA_PROJECTION_DENIED", "MediaProjection permission not granted. Call requestMediaProjectionPermission() first.", null)
            return@AsyncFunction
          }
          
          Log.d("ACRCloudModule", "✅ MediaProjection permission granted (resultCode: $mediaProjectionResultCode)")
          Log.d("ACRCloudModule", "✅ MediaProjection Intent stored in native side: $mMediaProjectionIntent")
          
          // 내부 소리 모드에서는 마이크 권한이 필요 없을 수 있지만, ACRCloud SDK가 여전히 필요할 수 있음
          hasPermission = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
          Log.d("ACRCloudModule", "Internal audio mode - RECORD_AUDIO permission check: $hasPermission")
          
          // MediaProjection Intent를 ACRCloud Config에 전달
          // 참고: ACRCloud SDK가 MediaProjection을 직접 지원하는지 확인 필요
          // 지원하지 않는다면 Android의 AudioPlaybackCapture API를 별도로 사용해야 함
          // 현재는 Intent를 저장만 하고, 실제 사용은 ACRCloud SDK가 지원하는 경우에만 가능
          Log.d("ACRCloudModule", "⚠️ Note: ACRCloud SDK may not support MediaProjection directly")
          Log.d("ACRCloudModule", "⚠️ May need to use Android AudioPlaybackCapture API separately")
          Log.d("ACRCloudModule", "⚠️ For now, MediaProjection Intent is stored but may not be used by ACRCloud SDK")
        } else {
          // 마이크 권한 확인 (런타임 권한)
          hasPermission = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
          Log.d("ACRCloudModule", "Microphone permission check: $hasPermission")
        }
        
        if (!hasPermission) {
          Log.e("ACRCloudModule", "❌ RECORD_AUDIO permission not granted!")
          promise.reject("PERMISSION_DENIED", "Microphone permission not granted", null)
          return@AsyncFunction
        }
        
        Log.d("ACRCloudModule", "=== Starting Recognition ===")
        Log.d("ACRCloudModule", "Context: Activity (required)")
        Log.d("ACRCloudModule", "Permission: $hasPermission")
        
        // 마이크 권한 재확인
        val permissionCheck = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO)
        Log.d("ACRCloudModule", "Permission check result: $permissionCheck (0=GRANTED)")
        
        // AudioRecord 점유 상태 체크 (다른 앱이 마이크를 사용 중인지 확인)
        Log.d("ACRCloudModule", "🔍 Checking if AudioRecord is available...")
        Log.d("ACRCloudModule", "🔍 If another app is using the microphone, AudioRecord may fail")
        Log.d("ACRCloudModule", "🔍 Common apps that use microphone: Phone calls, Voice recorder, Video apps, etc.")
        Log.d("ACRCloudModule", "🔍 If you see 'AudioRecord: start() status -38' error, another app is using the mic")
        
        try {
          Log.d("ACRCloudModule", "Calling mClient.startRecognize()...")
          Log.d("ACRCloudModule", "Config before startRecognize:")
          Log.d("ACRCloudModule", "  - context: ${mConfig?.context}")
          Log.d("ACRCloudModule", "  - context is Activity: ${mConfig?.context is Activity}")
          Log.d("ACRCloudModule", "  - isVolumeCallback: ${mConfig?.recorderConfig?.isVolumeCallback}")
          Log.d("ACRCloudModule", "  - reservedRecordBufferMS: ${mConfig?.recorderConfig?.reservedRecordBufferMS}")
          Log.d("ACRCloudModule", "  - Previous audio buffer should be cleared now")
          
          val startResult = mClient?.startRecognize()
          Log.d("ACRCloudModule", "startRecognize() returned: $startResult")
          
          if (startResult == true) {
            isRecognizing = true
            startTime = System.currentTimeMillis()
            Log.d("ACRCloudModule", "✅ Recognition started successfully")
            Log.d("ACRCloudModule", "⏳ Waiting for audio input...")
            Log.d("ACRCloudModule", "🔊 CRITICAL: If 'Volume changed' logs appear, microphone is working")
            Log.d("ACRCloudModule", "🔊 CRITICAL: If NO volume logs appear within 2-3 seconds, audio is NOT being received")
            Log.d("ACRCloudModule", "🔊 This could mean:")
            Log.d("ACRCloudModule", "   1. ACRCloud SDK's internal AudioRecord failed to start")
            Log.d("ACRCloudModule", "   2. Microphone is blocked or in use by another app")
            Log.d("ACRCloudModule", "   3. onVolumeChanged callback is not being triggered")
            Log.d("ACRCloudModule", "🔍 Check logcat for 'AudioRecord' errors or ACRCloud SDK internal logs")
            
            // 2초 후에도 볼륨 이벤트가 없으면 경고 로그
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
              if (isRecognizing) {
                Log.w("ACRCloudModule", "⚠️ ⚠️ ⚠️ WARNING: No volume events received after 2 seconds!")
                Log.w("ACRCloudModule", "⚠️ This means ACRCloud SDK is not receiving audio input")
                Log.w("ACRCloudModule", "⚠️ Possible causes:")
                Log.w("ACRCloudModule", "   - ACRCloud SDK's AudioRecord initialization failed silently")
                Log.w("ACRCloudModule", "   - Microphone is blocked (check Android 12+ privacy settings)")
                Log.w("ACRCloudModule", "   - Another app is using the microphone")
                Log.w("ACRCloudModule", "   - ACRCloud SDK configuration issue")
              }
            }, 2000)
            
            promise.resolve(true)
          } else {
            Log.e("ACRCloudModule", "❌ Failed to start recognition")
            Log.e("ACRCloudModule", "❌ Check logcat for 'AudioRecord: start() status -38' (mic in use by another app)")
            promise.reject("START_ERROR", "Failed to start recognition. Check logcat for AudioRecord errors.", null)
          }
        } catch (e: Exception) {
          Log.e("ACRCloudModule", "❌ Exception in startRecognize():", e)
          Log.e("ACRCloudModule", "❌ Exception message: ${e.message}")
          Log.e("ACRCloudModule", "❌ Exception class: ${e.javaClass.name}")
          Log.e("ACRCloudModule", "❌ Exception stack trace:")
          e.printStackTrace()
          promise.reject("START_ERROR", "Exception in startRecognize(): ${e.message}", e)
        }
      } catch (e: Exception) {
        Log.e("ACRCloudModule", "Error starting recognition", e)
        promise.reject("RECOGNITION_ERROR", "Failed to start recognition: ${e.message}", e)
      }
    }

    // 음악 인식 중지
    AsyncFunction("stopRecognizing") { promise: Promise ->
      try {
        if (!isRecognizing) {
          return@AsyncFunction promise.resolve(false)
        }
        
        Log.d("ACRCloudModule", "Stopping music recognition...")
        
        if (mClient != null && isRecognizing) {
          mClient?.cancel()
          Log.d("ACRCloudModule", "✅ Recognition cancelled")
        }
        
        isRecognizing = false
        promise.resolve(true)
      } catch (e: Exception) {
        Log.e("ACRCloudModule", "Error stopping recognition", e)
        promise.reject("STOP_ERROR", "Failed to stop recognition: ${e.message}", e)
      }
    }

    // 음악 인식 상태 확인
    Function("isRecognizing") {
      return@Function isRecognizing
    }

    // 초기화 상태 확인
    Function("isInitialized") {
      return@Function isInitialized
    }
  }
  
  // MainActivity에서 직접 호출할 수 있도록 public 함수로 분리
  // Intent는 Expo Module에서 직접 처리할 수 없으므로, MainActivity에서만 호출 가능
  // 중요: Intent 객체는 네이티브 단에만 저장하고, JS로 전달하지 않음
  fun setMediaProjectionResultInternal(resultCode: Int, data: Intent?) {
    try {
      Log.d("ACRCloudModule", "setMediaProjectionResultInternal called: resultCode=$resultCode")
      Log.d("ACRCloudModule", "Intent data received: ${if (data != null) "present" else "null"}")
      
      // Intent를 네이티브 변수에 저장 (JS로 전달하지 않음)
      mediaProjectionResultCode = resultCode
      mMediaProjectionIntent = data // 네이티브에만 저장
      
      if (resultCode == Activity.RESULT_OK && data != null) {
        Log.d("ACRCloudModule", "✅ MediaProjection permission granted")
        Log.d("ACRCloudModule", "✅ MediaProjection Intent saved in native side (not passed to JS)")
        Log.d("ACRCloudModule", "✅ Intent will be used when startRecognizing() is called")
        mediaProjectionPromise?.resolve(true)
      } else {
        Log.e("ACRCloudModule", "❌ MediaProjection permission denied (resultCode: $resultCode)")
        mediaProjectionPromise?.reject("PERMISSION_DENIED", "MediaProjection permission denied", null)
      }
      mediaProjectionPromise = null
    } catch (e: Exception) {
      Log.e("ACRCloudModule", "Error setting MediaProjection result", e)
      e.printStackTrace()
      mediaProjectionPromise?.reject("ERROR", "Failed to set MediaProjection result: ${e.message}", e)
      mediaProjectionPromise = null
    }
  }

  // 인식 결과 처리
  private fun handleRecognitionResult(results: ACRCloudResult?) {
    try {
      Log.d("ACRCloudModule", "=== handleRecognitionResult called ===")
      Log.d("ACRCloudModule", "results: $results")
      Log.d("ACRCloudModule", "isRecognizing: $isRecognizing")
      
      val resultString = results?.getResult()
      if (resultString == null) {
        Log.w("ACRCloudModule", "⚠️ Recognition result is null")
        Log.w("ACRCloudModule", "⚠️ Sending onRecognitionError event...")
        sendEvent("onRecognitionError", mapOf("error" to "Recognition result is null"))
        isRecognizing = false
        // 인식 결과가 null이어도 인식 중지
        try {
          if (mClient != null) {
            mClient?.cancel()
            Log.d("ACRCloudModule", "✅ Recognition stopped (null result)")
          }
        } catch (e: Exception) {
          Log.e("ACRCloudModule", "❌ Error stopping recognition: ${e.message}", e)
        }
        return
      }
      
      Log.d("ACRCloudModule", "✅ Recognition result received: $resultString")
      Log.d("ACRCloudModule", "✅ Parsing JSON result...")
      
      val jsonResult = JSONObject(resultString)
      val status = jsonResult.getJSONObject("status")
      val code = status.getInt("code")
      
      if (code == 0) {
        // 성공
        val metadata = jsonResult.getJSONObject("metadata")
        val musicInfo = if (metadata.has("music")) {
          val musicArray = metadata.getJSONArray("music")
          
          // 🔥 여러 후보가 있는지 확인하고 로그 출력
          Log.d("ACRCloudModule", "📊 Total music candidates: ${musicArray.length()}")
          
          if (musicArray.length() > 0) {
            // 모든 후보를 로그로 출력
            for (i in 0 until musicArray.length()) {
              val music = musicArray.getJSONObject(i)
              val artistsArray = music.optJSONArray("artists")
              val artistName = if (artistsArray != null && artistsArray.length() > 0) {
                artistsArray.getJSONObject(0).optString("name", "")
              } else {
                ""
              }
              val title = music.optString("title", "")
              val score = music.optInt("score", -1) // 신뢰도 점수 (있는 경우)
              val playOffset = music.optInt("play_offset_ms", -1) // 재생 오프셋
              
              Log.d("ACRCloudModule", "  Candidate #${i + 1}: '$title' by '$artistName' (score: $score, offset: $playOffset)")
            }
            
            // 첫 번째 결과 사용 (ACRCloud는 신뢰도 순으로 정렬된 결과를 반환)
            val firstMusic = musicArray.getJSONObject(0)
            
            // 아티스트 정보 파싱
            val artistsArray = firstMusic.optJSONArray("artists")
            val artistName = if (artistsArray != null && artistsArray.length() > 0) {
              artistsArray.getJSONObject(0).optString("name", "")
            } else {
              ""
            }
            
            // 앨범 정보 파싱
            val albumObj = firstMusic.optJSONObject("album")
            val albumName = albumObj?.optString("name", "") ?: ""
            
            val score = firstMusic.optInt("score", -1)
            val playOffset = firstMusic.optInt("play_offset_ms", -1)
            
            Log.d("ACRCloudModule", "✅ Selected result: '${firstMusic.optString("title", "")}' by '$artistName' (score: $score, offset: $playOffset)")
            
            mapOf(
              "title" to firstMusic.optString("title", ""),
              "artist" to artistName,
              "album" to albumName,
              "duration" to firstMusic.optInt("duration_ms", 0),
              "acrid" to firstMusic.optString("acrid", ""),
              "score" to score, // 신뢰도 점수 추가
              "playOffset" to playOffset // 재생 오프셋 추가
            )
          } else {
            null
          }
        } else {
          null
        }
        
        if (musicInfo != null) {
          Log.d("ACRCloudModule", "✅ Sending recognition result event: $musicInfo")
          Log.d("ACRCloudModule", "📝 Event name: onRecognitionResult")
          Log.d("ACRCloudModule", "📝 Event data: title=${musicInfo["title"]}, artist=${musicInfo["artist"]}")
          Log.d("ACRCloudModule", "📝 Event data type: ${musicInfo.javaClass.name}")
          Log.d("ACRCloudModule", "📝 Calling sendEvent('onRecognitionResult', ...)")
          try {
            sendEvent("onRecognitionResult", musicInfo)
            Log.d("ACRCloudModule", "✅✅✅ Event sent successfully to JS")
            Log.d("ACRCloudModule", "✅ JS should receive this event and update UI")
            Log.d("ACRCloudModule", "✅ Check JS console for '[MusicRecognitionScreen] ✅✅✅ Recognition result received'")
          } catch (e: Exception) {
            Log.e("ACRCloudModule", "❌❌❌ Error sending event: ${e.message}", e)
            Log.e("ACRCloudModule", "❌ Exception class: ${e.javaClass.name}")
            e.printStackTrace()
          }
          // 인식 결과를 받았으므로 인식 중지
          isRecognizing = false
          try {
            if (mClient != null) {
              mClient?.cancel()
              Log.d("ACRCloudModule", "✅ Recognition stopped after receiving result")
            }
          } catch (e: Exception) {
            Log.e("ACRCloudModule", "❌ Error stopping recognition: ${e.message}", e)
          }
        } else {
          Log.w("ACRCloudModule", "⚠️ No music found in result")
          try {
            sendEvent("onRecognitionError", mapOf("error" to "No music found"))
            Log.d("ACRCloudModule", "✅ Error event sent")
          } catch (e: Exception) {
            Log.e("ACRCloudModule", "❌ Error sending error event: ${e.message}", e)
          }
          isRecognizing = false
          // 음악을 찾지 못했어도 인식 중지
          try {
            if (mClient != null) {
              mClient?.cancel()
              Log.d("ACRCloudModule", "✅ Recognition stopped (no music found)")
            }
          } catch (e: Exception) {
            Log.e("ACRCloudModule", "❌ Error stopping recognition: ${e.message}", e)
          }
        }
      } else {
        // 실패
        val message = status.optString("msg", "Recognition failed")
        Log.w("ACRCloudModule", "⚠️ Recognition failed with code: $code, message: $message")
        try {
          sendEvent("onRecognitionError", mapOf("error" to message, "code" to code))
          Log.d("ACRCloudModule", "✅ Error event sent")
        } catch (e: Exception) {
          Log.e("ACRCloudModule", "❌ Error sending error event: ${e.message}", e)
        }
        isRecognizing = false
        // 인식 실패해도 인식 중지
        try {
          if (mClient != null) {
            mClient?.cancel()
            Log.d("ACRCloudModule", "✅ Recognition stopped (recognition failed)")
          }
        } catch (e: Exception) {
          Log.e("ACRCloudModule", "❌ Error stopping recognition: ${e.message}", e)
        }
      }
    } catch (e: Exception) {
      Log.e("ACRCloudModule", "❌ Error parsing recognition result", e)
      e.printStackTrace()
      try {
        sendEvent("onRecognitionError", mapOf("error" to (e.message ?: "Unknown error")))
        Log.d("ACRCloudModule", "✅ Error event sent")
      } catch (eventError: Exception) {
        Log.e("ACRCloudModule", "❌ Error sending error event: ${eventError.message}", eventError)
      }
      isRecognizing = false
      // 파싱 에러가 발생해도 인식 중지
      try {
        if (mClient != null) {
          mClient?.cancel()
          Log.d("ACRCloudModule", "✅ Recognition stopped (parsing error)")
        }
      } catch (e: Exception) {
        Log.e("ACRCloudModule", "❌ Error stopping recognition: ${e.message}", e)
      }
    }
  }

  // 리소스 정리 함수 (필요시 호출)
  private fun cleanup() {
    try {
      if (mClient != null) {
        mClient?.release()
        mClient = null
        mConfig = null
        isInitialized = false
        isRecognizing = false
        Log.d("ACRCloudModule", "ACRCloud resources released")
      }
    } catch (e: Exception) {
      Log.e("ACRCloudModule", "Error releasing ACRCloud resources", e)
    }
  }
}
