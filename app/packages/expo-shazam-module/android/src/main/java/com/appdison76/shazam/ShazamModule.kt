package com.appdison76.shazam

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.coroutines.Continuation
import kotlin.coroutines.suspendCoroutine

/**
 * ShazamModule - ShazamKit Android 음악 인식
 * 2중 폴백: Shazam (1순위) → ACRCloud (2순위)
 */
class ShazamModule : Module() {
  private var developerToken: String? = null
  private var isInitialized = false
  @Volatile private var isRecognizing = false
  private var recognitionJob: Job? = null
  private val scope = CoroutineScope(Dispatchers.Main.immediate + Job())

  override fun definition() = ModuleDefinition {
    Name("ShazamModule")
    Events("onRecognitionResult", "onRecognitionError", "onVolumeChanged")

    Function("isAvailable") {
      try {
        Class.forName("com.shazam.shazamkit.ShazamKit")
        true
      } catch (e: ClassNotFoundException) {
        Log.d("ShazamModule", "ShazamKit not available (AAR not added).")
        false
      }
    }

    AsyncFunction("initialize") { token: String?, promise: expo.modules.kotlin.Promise ->
      if (!isShazamAvailable()) {
        promise.resolve(false)
        return@AsyncFunction
      }
      // 환경변수/복붙 시 줄바꿈·공백 들어갈 수 있음 → 제거 후 저장
      developerToken = token?.replace("\n", "")?.replace("\r", "")?.trim()?.takeIf { it.isNotBlank() }
      isInitialized = developerToken != null
      Log.d("ShazamModule", "initialize: token=${if (token != null) "***" else "null"}, isInitialized=$isInitialized")
      promise.resolve(isInitialized)
    }

    AsyncFunction("startRecognizing") { promise: expo.modules.kotlin.Promise ->
      if (!isShazamAvailable()) {
        promise.reject("NOT_AVAILABLE", "ShazamKit not configured.", null)
        return@AsyncFunction
      }
      if (developerToken == null) {
        promise.reject("NOT_INITIALIZED", "Call initialize(developerToken) first.", null)
        return@AsyncFunction
      }
      val activity = appContext.activityProvider?.currentActivity ?: run {
        promise.reject("NO_ACTIVITY", "Activity required.", null)
        return@AsyncFunction
      }
      val ctx = activity as Context
      if (ctx.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        promise.reject("PERMISSION_DENIED", "RECORD_AUDIO required.", null)
        return@AsyncFunction
      }
      recognitionJob?.cancel()
      recognitionJob = scope.launch(Dispatchers.IO) {
        runShazamRecognition(ctx)
      }
      isRecognizing = true
      promise.resolve(true)
    }

    AsyncFunction("stopRecognizing") { promise: expo.modules.kotlin.Promise ->
      recognitionJob?.cancel()
      recognitionJob = null
      isRecognizing = false
      promise.resolve(Unit)
    }

    Function("isInitialized") { isInitialized }
    Function("isRecognizing") { isRecognizing }
  }

  private fun isShazamAvailable(): Boolean = try {
    Class.forName("com.shazam.shazamkit.ShazamKit")
    true
  } catch (e: ClassNotFoundException) {
    false
  }

  private suspend fun runShazamRecognition(context: Context) {
    if (!isShazamAvailable()) return
    val token = developerToken ?: return
    try {
      val shazamKit = Class.forName("com.shazam.shazamkit.ShazamKit")
      // createShazamCatalog가 인스턴스 메서드일 수 있음: 싱글톤 인스턴스 획득 (INSTANCE 또는 getInstance())
      val shazamKitInstance = try { shazamKit.getField("INSTANCE").get(null) } catch (_: Exception) { null }
        ?: try { shazamKit.getMethod("getInstance").invoke(null) } catch (_: Exception) { null }
      if (shazamKitInstance == null) Log.d("ShazamModule", "ShazamKit static methods assumed (receiver=null)")

      val audioSampleRateClass = Class.forName("com.shazam.shazamkit.AudioSampleRateInHz")
      val audioSampleRate = audioSampleRateClass.getField("SAMPLE_RATE_48000").get(null) // AudioSampleRateInHz 객체 (Int 아님)
      val successClass = Class.forName("com.shazam.shazamkit.ShazamKitResult\$Success")
      val failureClass = Class.forName("com.shazam.shazamkit.ShazamKitResult\$Failure")

      // DeveloperTokenProvider는 DeveloperToken 객체 반환 필요 (String 반환 시 "Couldn't convert String to DeveloperToken" 발생)
      val developerTokenClass = Class.forName("com.shazam.shazamkit.DeveloperToken")
      val developerTokenInstance = try {
        try {
          developerTokenClass.getConstructor(String::class.java).newInstance(token)
        } catch (_: Exception) {
          try {
            developerTokenClass.getMethod("from", String::class.java).invoke(null, token)
          } catch (_: Exception) {
            developerTokenClass.getDeclaredConstructor(String::class.java).apply { isAccessible = true }.newInstance(token)
          }
        }
      } catch (e: Exception) {
        Log.e("ShazamModule", "DeveloperToken create failed: ${e.message}")
        null
      }
      if (developerTokenInstance == null) {
        withContext(Dispatchers.Main) { sendEvent("onRecognitionError", mapOf("error" to "DeveloperToken creation failed")) }
        return
      }

      val provider = java.lang.reflect.Proxy.newProxyInstance(
        shazamKit.classLoader,
        arrayOf(Class.forName("com.shazam.shazamkit.DeveloperTokenProvider"))
      ) { _, method, _ ->
        if (method.name == "provideDeveloperToken") developerTokenInstance else null
      }

      // createShazamCatalog(DeveloperTokenProvider, Locale?) — API가 Catalog를 직접 반환할 수 있음 (Success 래퍼 아님)
      val catalogClass = Class.forName("com.shazam.shazamkit.ShazamCatalog")
      val createCatalogMethod = shazamKit.getMethod("createShazamCatalog", Class.forName("com.shazam.shazamkit.DeveloperTokenProvider"), java.util.Locale::class.java)
      val catalogResult = createCatalogMethod.invoke(shazamKitInstance, provider, java.util.Locale.getDefault())
      if (catalogResult == null) {
        Log.e("ShazamModule", "createShazamCatalog failed: null")
        withContext(Dispatchers.Main) { sendEvent("onRecognitionError", mapOf("error" to "Catalog creation failed")) }
        return
      }
      val catalog = if (catalogClass.isInstance(catalogResult)) catalogResult else if (successClass.isInstance(catalogResult)) successClass.getMethod("getData").invoke(catalogResult) else null
      if (catalog == null) {
        Log.e("ShazamModule", "createShazamCatalog failed: unexpected type $catalogResult")
        withContext(Dispatchers.Main) { sendEvent("onRecognitionError", mapOf("error" to "Catalog creation failed")) }
        return
      }
      Log.d("ShazamModule", "createShazamCatalog OK")

      // createStreamingSession — suspend 함수라 4번째 인자가 Continuation. getMethod는 제네릭/로더 차이로 실패할 수 있으므로 이름+인자 개수로 탐색
      val bufferSize = AudioRecord.getMinBufferSize(48000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      val readBufferSize = bufferSize * 2
      val createStreamingMethod = shazamKit.getMethods().find { m ->
        m.name == "createStreamingSession" && m.parameterTypes.size == 4 &&
          m.parameterTypes[0].isAssignableFrom(catalog.javaClass) &&
          m.parameterTypes[1].isAssignableFrom(audioSampleRateClass) &&
          m.parameterTypes[2] == Int::class.javaPrimitiveType &&
          (Continuation::class.java.isAssignableFrom(m.parameterTypes[3]) || m.parameterTypes[3].name == "kotlin.coroutines.Continuation")
      } ?: run {
        val fallback = shazamKit.getMethods().find { it.name == "createStreamingSession" && it.parameterTypes.size == 4 }
        if (fallback != null) Log.d("ShazamModule", "createStreamingSession param[3]=" + fallback.parameterTypes[3].name)
        fallback
      }
      if (createStreamingMethod == null) {
        Log.e("ShazamModule", "createStreamingSession(4 params) not found. Available: " + shazamKit.getMethods().filter { it.name == "createStreamingSession" }.joinToString { it.parameterTypes.map { p -> p.name }.toString() })
        withContext(Dispatchers.Main) { sendEvent("onRecognitionError", mapOf("error" to "createStreamingSession not found")) }
        return
      }
      val sessionResult = suspendCoroutine { cont ->
        createStreamingMethod.invoke(shazamKitInstance, catalog, audioSampleRate, readBufferSize, object : Continuation<Any?> {
          override val context = cont.context
          override fun resumeWith(result: kotlin.Result<Any?>) {
            cont.resumeWith(result)
          }
        })
      }
      if (sessionResult == null) {
        Log.e("ShazamModule", "createStreamingSession failed: null")
        withContext(Dispatchers.Main) { sendEvent("onRecognitionError", mapOf("error" to "StreamingSession failed")) }
        return
      }
      val session = if (successClass.isInstance(sessionResult)) successClass.getMethod("getData").invoke(sessionResult) else sessionResult
      if (session == null) {
        Log.e("ShazamModule", "createStreamingSession failed")
        withContext(Dispatchers.Main) { sendEvent("onRecognitionError", mapOf("error" to "StreamingSession failed")) }
        return
      }
      Log.d("ShazamModule", "createStreamingSession OK, bufferSize=$bufferSize")

      val matchStreamMethod = session.javaClass.getMethod("matchStream", ByteArray::class.java, Int::class.javaPrimitiveType, Long::class.javaPrimitiveType)
      val recognitionResultsMethod = session.javaClass.getMethod("recognitionResults")
              ?: session.javaClass.getMethods().find { it.name == "recognitionResults" } ?: return
      val resultsFlow = recognitionResultsMethod.invoke(session) as? Flow<*>
      if (resultsFlow == null) {
        Log.e("ShazamModule", "recognitionResults() did not return a Flow")
        withContext(Dispatchers.Main) { sendEvent("onRecognitionError", mapOf("error" to "recognitionResults failed")) }
        return
      }
      // 재미나이 조언: MatchResult.Match 인 경우에만 mediaItem 가져오기. Error는 getMediaItem 없음 → 스킵
      val matchResultErrorClass = try { Class.forName("com.shazam.shazamkit.MatchResult\$Error") } catch (_: Exception) { null }
      val matchResultMatchClass = try { Class.forName("com.shazam.shazamkit.MatchResult\$Match") } catch (_: Exception) { null }
      val matchResultSuccessClass = try { Class.forName("com.shazam.shazamkit.MatchResult\$Success") } catch (_: Exception) { null }
      Log.d("ShazamModule", "Starting to collect recognitionResults Flow")
      val collectJob = scope.launch(Dispatchers.IO) {
        try {
          @Suppress("UNCHECKED_CAST")
          (resultsFlow as Flow<Any>).collect { matchResult ->
            val simpleName = matchResult?.javaClass?.simpleName ?: ""
            Log.d("ShazamModule", "Flow emitted matchResult: $simpleName")
            if (!isRecognizing) return@collect
            // Error 타입 → 스킵. 재미나이 조언: exception 클래스·메시지·cause까지 로그 (토큰/네트워크 vs 매칭실패 구분)
            if (matchResultErrorClass != null && matchResultErrorClass.isInstance(matchResult) || simpleName == "Error") {
              val (exClass, exMsg, causeMsg) = try {
                val c = matchResult?.javaClass ?: return@collect
                val err = listOf("getError", "getException").firstNotNullOfOrNull { name ->
                  try { c.getMethod(name).invoke(matchResult) } catch (_: Exception) { null }
                }
                if (err == null) Triple("", matchResult?.toString()?.take(150).orEmpty(), "") else {
                  val cls = err.javaClass.simpleName
                  val msg = try { err.javaClass.getMethod("getMessage").invoke(err)?.toString() } catch (_: Exception) { null } ?: ""
                  val cause = try {
                    val causeObj = err.javaClass.getMethod("getCause").invoke(err)
                    causeObj?.let { try { it.javaClass.getMethod("getMessage").invoke(it)?.toString() } catch (_: Exception) { it.toString() } } ?: ""
                  } catch (_: Exception) { "" }
                  Triple(cls, msg.take(150), cause.take(150))
                }
              } catch (_: Exception) { Triple("", matchResult?.toString()?.take(150).orEmpty(), "") }
              Log.d("ShazamModule", "MatchResult Error: $exClass | $exMsg${if (causeMsg.isNotEmpty()) " | cause=$causeMsg" else ""}")
              return@collect
            }
            // MatchResult.Match 또는 .Success 일 때만 mediaItem 파싱 (조건 강화)
            val isMatch = matchResultMatchClass != null && matchResultMatchClass.isInstance(matchResult)
            val isSuccess = matchResultSuccessClass != null && matchResultSuccessClass.isInstance(matchResult)
            if (!isMatch && !isSuccess) {
              Log.d("ShazamModule", "MatchResult is not Match/Success ($simpleName), skipping")
              return@collect
            }
            try {
              // 재미나이: matchResult.mediaItems.firstOrNull() — 리스트 첫 항목에서 곡 정보 추출
              fun firstElementFrom(any: Any?): Any? {
                if (any == null) return null
                return try {
                  when {
                    any.javaClass.isArray -> if (java.lang.reflect.Array.getLength(any) > 0) java.lang.reflect.Array.get(any, 0) else null
                    any is java.util.Collection<*> -> (any as java.util.Collection<*>).firstOrNull()
                    else -> {
                      val itM = any.javaClass.getMethods().find { it.name == "iterator" && it.parameterCount == 0 }
                      if (itM != null) {
                        val it = itM.invoke(any)
                        if (it != null && it.javaClass.getMethod("hasNext").invoke(it) == true)
                          it.javaClass.getMethod("next").invoke(it) else null
                      } else {
                        val sizeM = any.javaClass.getMethods().find { it.name == "size" && it.parameterCount == 0 }
                        val getM = any.javaClass.getMethods().find { it.name == "get" && it.parameterTypes.size == 1 && (it.parameterTypes[0] == Int::class.javaPrimitiveType || it.parameterTypes[0] == Int::class.java) }
                        if (sizeM != null && getM != null) {
                          val size = (sizeM.invoke(any) as? Number)?.toInt() ?: 0
                          if (size > 0) getM.invoke(any, 0) else null
                        } else null
                      }
                    }
                  }
                } catch (_: Exception) { null }
              }
              val getterNames = listOf("getMediaItems", "getMediaItemList", "getMatchedMediaItem", "getMediaItem", "getMedia", "getMatch", "getItems")
              var mediaItem = getterNames.mapNotNull { name ->
                try {
                  val m = matchResult.javaClass.getMethods().find { it.name == name && it.parameterCount == 0 }
                  val value = m?.invoke(matchResult) as? Any ?: return@mapNotNull null
                  if (value.javaClass.isArray || value is java.util.Collection<*> || value.javaClass.getMethods().any { it.name == "size" }) firstElementFrom(value) else value
                } catch (_: Exception) { null }
              }.firstOrNull()
              // 이름으로 못 찾으면: 0인자 getter 전부 시도해 리스트/배열이면 첫 요소, 단일 객체면 getTitle 존재 시 사용
              if (mediaItem == null) {
                mediaItem = matchResult.javaClass.getMethods()
                  .filter { it.parameterCount == 0 && it.name.startsWith("get") && it.returnType != Void.TYPE }
                  .mapNotNull { m ->
                    try {
                      val value = m.invoke(matchResult) as? Any ?: return@mapNotNull null
                      val first = if (value.javaClass.isArray || value is java.util.Collection<*> || value.javaClass.getMethods().any { it.name == "size" || it.name == "iterator" }) firstElementFrom(value) else value
                      if (first != null && first.javaClass.getMethods().any { it.name == "getTitle" }) first else null
                    } catch (_: Exception) { null }
                  }.firstOrNull()
              }
              if (mediaItem != null) {
                val title = try { mediaItem.javaClass.getMethod("getTitle").invoke(mediaItem)?.toString() } catch (_: Exception) { null } ?: ""
                val artist = try { mediaItem.javaClass.getMethod("getArtist").invoke(mediaItem)?.toString() } catch (_: Exception) { null } ?: ""
                val album = try { mediaItem.javaClass.getMethod("getAlbumTitle").invoke(mediaItem)?.toString() } catch (_: Exception) { null } ?: ""
                withContext(Dispatchers.Main) {
                  sendEvent("onRecognitionResult", mapOf(
                    "title" to title,
                    "artist" to artist,
                    "album" to album
                  ))
                  isRecognizing = false
                }
              } else {
                val getters = matchResult.javaClass.getMethods().filter { it.parameterCount == 0 && it.name.startsWith("get") }.map { it.name }.sorted().joinToString(", ")
                Log.e("ShazamModule", "Match result: no media found. Match getters=[$getters]")
              }
            } catch (e: Exception) {
              Log.e("ShazamModule", "Result parse error", e)
            }
          }
        } catch (e: Exception) {
          if (e !is kotlinx.coroutines.CancellationException) Log.e("ShazamModule", "recognitionResults collect error", e)
        }
      }

      // Record and feed audio
      val sampleRate = 48000
      val channelConfig = AudioFormat.CHANNEL_IN_MONO
      val audioFormat = AudioFormat.ENCODING_PCM_16BIT
      val minBuf = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
      val audioSource = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        MediaRecorder.AudioSource.UNPROCESSED
      } else {
        MediaRecorder.AudioSource.MIC
      }
      val record = AudioRecord(audioSource, sampleRate, channelConfig, audioFormat, minBuf * 2)
      if (record.state != AudioRecord.STATE_INITIALIZED) {
        record.release()
        withContext(Dispatchers.Main) { sendEvent("onRecognitionError", mapOf("error" to "AudioRecord init failed")) }
        return
      }
      record.startRecording()
      Log.d("ShazamModule", "AudioRecord started, feeding to matchStream (48kHz mono)")
      val buffer = ByteArray(minBuf)
      // 상대 타임스탬프(ms): 0부터 누적. 문서는 System.currentTimeMillis() 권장하나 연속 버퍼는 상대 시간이 안정적
      var timestampMs = 0L
      val bytesPerSecond = sampleRate * 2L
      var feedCount = 0L
      try {
        while (isRecognizing && scope.isActive) {
          val read = record.read(buffer, 0, buffer.size)
          if (read > 0) {
            matchStreamMethod.invoke(session, buffer, read, timestampMs)
            timestampMs += read * 1000L / bytesPerSecond
            feedCount++
            if (feedCount % 100 == 0L) Log.d("ShazamModule", "matchStream fed $feedCount buffers")
          }
          kotlinx.coroutines.delay(30)
        }
        Log.d("ShazamModule", "Stopped feeding, total buffers=$feedCount")
      } finally {
        record.stop()
        record.release()
        collectJob.cancel()
      }
    } catch (e: Exception) {
      Log.e("ShazamModule", "runShazamRecognition error", e)
      withContext(Dispatchers.Main) {
        sendEvent("onRecognitionError", mapOf("error" to (e.message ?: "Unknown error")))
      }
    } finally {
      isRecognizing = false
    }
  }
}
