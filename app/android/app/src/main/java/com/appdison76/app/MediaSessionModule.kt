package com.appdison76.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.PorterDuff
import android.os.Build
import android.os.SystemClock
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.IconCompat
import androidx.media.app.NotificationCompat.MediaStyle
import com.appdison76.app.MediaButtonReceiver
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.net.URL
import java.util.concurrent.Executors

class MediaSessionModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private var mediaSession: MediaSessionCompat? = null
  private var notificationManager: NotificationManager? = null
  private val CHANNEL_ID = "audio-playback"
  private val NOTIFICATION_ID = 1
  private val executor = Executors.newSingleThreadExecutor()

  companion object {
    @Volatile
    private var instance: MediaSessionModule? = null

    fun getInstance(): MediaSessionModule? = instance

    fun setInstance(module: MediaSessionModule?) {
      instance = module
    }
  }

  init {
    setInstance(this)
  }

  override fun getName(): String {
    return "MediaSessionModule"
  }

  // 재미나이 조언: 투명도 조절 및 회색 필터 적용 유틸리티 함수
  private fun getTransparentIcon(context: Context, resourceId: Int, alpha: Int): IconCompat {
    val drawable = ContextCompat.getDrawable(context, resourceId)?.mutate() ?: 
        return IconCompat.createWithResource(context, resourceId)
    
    val width = drawable.intrinsicWidth.coerceAtLeast(1)
    val height = drawable.intrinsicHeight.coerceAtLeast(1)
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    
    drawable.setBounds(0, 0, width, height)
    drawable.alpha = alpha
    // 회색 필터를 입혀서 시스템이 마음대로 밝게 만드는 것을 방지
    drawable.setColorFilter(android.graphics.Color.GRAY, PorterDuff.Mode.SRC_IN)
    drawable.draw(canvas)
    
    return IconCompat.createWithBitmap(bitmap)
  }

  @ReactMethod
  fun initialize(promise: Promise) {
    try {
      val context = reactApplicationContext ?: run {
        promise.reject("NO_CONTEXT", "No context available", null)
        return
      }
      
      notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      
      // 알림 채널 생성
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          "음악 재생",
          NotificationManager.IMPORTANCE_HIGH
        ).apply {
          description = "음악 재생 알림 및 잠금화면 컨트롤"
          setShowBadge(false)
          setSound(null, null)
          enableVibration(false)
        }
        notificationManager?.createNotificationChannel(channel)
      }

      // MediaSession 생성
      // 알림 터치 시 앱을 열기 위한 Intent 생성
      val intent = try {
        Intent().apply {
          setClassName(context.packageName, "com.appdison76.app.MainActivity")
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
          action = Intent.ACTION_MAIN
          addCategory(Intent.CATEGORY_LAUNCHER)
        }
      } catch (e: Exception) {
        android.util.Log.e("MediaSessionModule", "MainActivity not found, falling back to package manager: ${e.message}")
        context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        } ?: Intent(context, context.javaClass).apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
      }
      val pendingIntent = PendingIntent.getActivity(
        context,
        0,
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )

      // MediaButtonReceiver를 위한 PendingIntent 생성
      val mediaButtonIntent = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
        setClass(context, MediaButtonReceiver::class.java)
      }
      val mediaButtonPendingIntent = PendingIntent.getBroadcast(
        context,
        0,
        mediaButtonIntent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )

      mediaSession = MediaSessionCompat(context, "MeTubeMediaSession", null, mediaButtonPendingIntent).apply {
        setCallback(object : MediaSessionCompat.Callback() {
          override fun onPlay() {
            android.util.Log.d("MediaSessionModule", "Callback: onPlay")
            sendEvent("play", null)
          }

          override fun onPause() {
            android.util.Log.d("MediaSessionModule", "Callback: onPause")
            sendEvent("pause", null)
          }

          override fun onSkipToNext() {
            android.util.Log.d("MediaSessionModule", "Callback: onSkipToNext")
            sendEvent("next", null)
          }

          override fun onSkipToPrevious() {
            android.util.Log.d("MediaSessionModule", "Callback: onSkipToPrevious")
            sendEvent("previous", null)
          }

          override fun onStop() {
            android.util.Log.d("MediaSessionModule", "Callback: onStop")
            sendEvent("stop", null)
          }

          override fun onSeekTo(pos: Long) {
            android.util.Log.d("MediaSessionModule", "Callback: onSeekTo: $pos")
            val params = Arguments.createMap().apply {
              putDouble("position", pos.toDouble())
            }
            sendEvent("seek", params)
          }
        })
        setFlags(
          MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
          MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        )
        isActive = true
        setSessionActivity(pendingIntent) // MediaSession에 PendingIntent 설정
      }

      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("INIT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun updateMetadata(title: String, artist: String, thumbnailUrl: String?, duration: Double?, promise: Promise) {
    try {
      val session = mediaSession ?: run {
        promise.reject("NO_SESSION", "MediaSession not initialized", null)
        return
      }
      
      // 제목과 아티스트는 즉시 설정 (썸네일 로드 전에)
      val metadataBuilder = MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
      
      // duration 추가 (트랙바 표시를 위해 필요)
      if (duration != null) {
        metadataBuilder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration.toLong())
      }
      
      // 메타데이터를 먼저 설정 (제목과 아티스트가 즉시 표시되도록)
      session.setMetadata(metadataBuilder.build())
      
      // 썸네일 로드 (비동기, 로드 완료 후 업데이트)
      if (thumbnailUrl != null && thumbnailUrl.isNotEmpty()) {
        executor.execute {
          try {
            val url = URL(thumbnailUrl)
            val connection = url.openConnection()
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            val bitmap = BitmapFactory.decodeStream(connection.getInputStream())
            if (bitmap != null) {
              // 썸네일 로드 완료 후 메타데이터 업데이트
              val updatedMetadataBuilder = MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                .putBitmap(MediaMetadataCompat.METADATA_KEY_ART, bitmap)
              
              // duration도 유지
              if (duration != null) {
                updatedMetadataBuilder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration.toLong())
              }
              
              session.setMetadata(updatedMetadataBuilder.build())
            }
          } catch (e: Exception) {
            // 썸네일 로드 실패 시 무시 (제목과 아티스트는 이미 설정됨)
          }
        }
      }
      
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("UPDATE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun updatePlaybackState(isPlaying: Boolean, canGoNext: Boolean, canGoPrevious: Boolean, position: Double?, duration: Double?, promise: Promise) {
    try {
      val session = mediaSession ?: run {
        promise.reject("NO_SESSION", "MediaSession not initialized", null)
        return
      }
      
      android.util.Log.d("MediaSessionModule", "updatePlaybackState called: isPlaying=$isPlaying, position=$position, duration=$duration")
      
      // 1. 상태 결정
      val state = if (isPlaying) {
        PlaybackStateCompat.STATE_PLAYING
      } else {
        PlaybackStateCompat.STATE_PAUSED
      }
      
      // 2. 재생 속도 (재생 중일 때만 1.0f여야 트랙바가 움직임)
      val playbackSpeed = if (isPlaying) 1.0f else 0.0f
      
      // 3. Position 처리
      // RN에서 넘어오는 position(밀리초)을 Long으로 변환
      val playbackPosition = if (position != null && position >= 0) {
        position.toLong()
      } else {
        PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN
      }
      
      android.util.Log.d("MediaSessionModule", "playbackPosition: $playbackPosition (from position: $position)")
      
      // 4. 핵심: SystemClock.elapsedRealtime() 사용
      // 안드로이드 미디어 컨트롤러는 이 값을 기준으로 "현재 위치 = position + (현재시간 - updateTime) * speed"를 계산함
      // System.currentTimeMillis()는 절대 시각이지만, SystemClock.elapsedRealtime()은 부팅 후 경과 시간을 반환
      // 재생 중일 때만 현재 시간을 기준으로 트랙바 동기화 (일시정지 시에는 0으로 설정하여 불필요한 업데이트 방지)
      val updateTime = if (isPlaying) SystemClock.elapsedRealtime() else 0L
      
      android.util.Log.d("MediaSessionModule", "updateTime: $updateTime (elapsedRealtime), playbackSpeed: $playbackSpeed, state: $state")
      
      // Actions를 동적으로 설정 (버튼 표시 여부 결정)
      var actions = PlaybackStateCompat.ACTION_PLAY_PAUSE or
                    PlaybackStateCompat.ACTION_PLAY or
                    PlaybackStateCompat.ACTION_PAUSE or
                    PlaybackStateCompat.ACTION_STOP or
                    PlaybackStateCompat.ACTION_SEEK_TO
      
      if (canGoNext) {
        actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_NEXT
      }
      
      if (canGoPrevious) {
        actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
      }
      
      val playbackState = PlaybackStateCompat.Builder()
        .setState(state, playbackPosition, playbackSpeed, updateTime)
        .setActions(actions)
        .build()
      
      android.util.Log.d("MediaSessionModule", "Setting playback state: position=$playbackPosition, updateTime=$updateTime, state=$state")
      session.setPlaybackState(playbackState)
      android.util.Log.d("MediaSessionModule", "Playback state set successfully")
      // MediaStyle 알림이 자동으로 PlaybackStateCompat를 읽어서 트랙바를 업데이트함 (수동 업데이트 불필요)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("UPDATE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun showNotification(promise: Promise) {
    try {
      val context = reactApplicationContext ?: run {
        promise.reject("NO_CONTEXT", "No context available", null)
        return
      }
      val session = mediaSession ?: run {
        promise.reject("NO_SESSION", "MediaSession not initialized", null)
        return
      }
      val manager = notificationManager ?: run {
        promise.reject("NO_MANAGER", "NotificationManager not initialized", null)
        return
      }
      
      // 알림 터치 시 앱을 열기 위한 Intent 생성
      val intent = try {
        Intent().apply {
          setClassName(context.packageName, "com.appdison76.app.MainActivity")
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
          action = Intent.ACTION_MAIN
          addCategory(Intent.CATEGORY_LAUNCHER)
        }
      } catch (e: Exception) {
        android.util.Log.e("MediaSessionModule", "MainActivity not found, falling back to package manager: ${e.message}")
        context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        } ?: Intent(context, context.javaClass).apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
      }
      val pendingIntent = PendingIntent.getActivity(
        context,
        0,
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )

      val metadata = session.controller.metadata
      val playbackState = session.controller.playbackState
      
      val isPlaying = playbackState?.state == PlaybackStateCompat.STATE_PLAYING
      val actions = playbackState?.actions ?: 0
      
      // playbackState의 actions를 확인하여 버튼 표시 여부 결정
      val canShowPrevious = actions and PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS != 0L
      val canShowNext = actions and PlaybackStateCompat.ACTION_SKIP_TO_NEXT != 0L
      
      android.util.Log.d("MediaSessionModule", "showNotification: isPlaying=$isPlaying, canShowNext=$canShowNext, canShowPrevious=$canShowPrevious, actions=$actions")
      
      val notificationBuilder = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_media_play)
        .setContentTitle(metadata?.getString(MediaMetadataCompat.METADATA_KEY_TITLE) ?: "재생 중")
        .setContentText(metadata?.getString(MediaMetadataCompat.METADATA_KEY_ARTIST) ?: "MeTube")
        .setLargeIcon(metadata?.getBitmap(MediaMetadataCompat.METADATA_KEY_ART))
      
      // 버튼을 조건부로 추가하되, 재생/일시정지 버튼이 항상 중앙에 오도록 정렬
      var actionIndex = 0
      val compactViewIndices = mutableListOf<Int>()
      
      // 이전 버튼 (조건부)
      if (canShowPrevious) {
        android.util.Log.d("MediaSessionModule", "Adding previous button at index $actionIndex")
        notificationBuilder.addAction(
          android.R.drawable.ic_media_previous,
          "이전",
          MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
        )
        compactViewIndices.add(actionIndex)
        actionIndex++
      }
      
      // 재생/일시정지 버튼 (항상 중앙에 위치)
      val playPauseIndex = actionIndex
      android.util.Log.d("MediaSessionModule", "Adding play/pause button at index $playPauseIndex, isPlaying=$isPlaying")
      notificationBuilder.addAction(
        if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
        if (isPlaying) "일시정지" else "재생",
        MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_PLAY_PAUSE)
      )
      compactViewIndices.add(playPauseIndex)
      actionIndex++
      
      // 다음 버튼 (조건부)
      if (canShowNext) {
        android.util.Log.d("MediaSessionModule", "Adding next button at index $actionIndex")
        notificationBuilder.addAction(
          android.R.drawable.ic_media_next,
          "다음",
          MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_SKIP_TO_NEXT)
        )
        compactViewIndices.add(actionIndex)
        actionIndex++
      }
      
      // MediaStyle 설정 - 재생/일시정지 버튼이 항상 중앙에 오도록 인덱스 조정
      val mediaStyle = MediaStyle()
        .setMediaSession(session.sessionToken)
      
      // 버튼 개수에 따라 compactView 인덱스 조정
      when (compactViewIndices.size) {
        1 -> {
          // 재생/일시정지만 있는 경우 (이론적으로는 발생하지 않음)
          mediaStyle.setShowActionsInCompactView(compactViewIndices[0])
        }
        2 -> {
          // 이전 또는 다음 중 하나만 있는 경우
          // 재생/일시정지 버튼이 중앙에 오도록 인덱스 조정
          if (!canShowPrevious) {
            // [재생/일시정지] [다음] -> 인덱스 0, 1
            mediaStyle.setShowActionsInCompactView(0, 1)
          } else {
            // [이전] [재생/일시정지] -> 인덱스 0, 1
            mediaStyle.setShowActionsInCompactView(0, 1)
          }
        }
        3 -> {
          // 모든 버튼이 있는 경우
          mediaStyle.setShowActionsInCompactView(0, 1, 2)
        }
      }
      
      android.util.Log.d("MediaSessionModule", "Compact view indices: ${compactViewIndices.joinToString()}, total actions: $actionIndex, canShowPrevious=$canShowPrevious, canShowNext=$canShowNext")
      
      notificationBuilder.setStyle(mediaStyle)
      
      val notification = notificationBuilder
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setContentIntent(pendingIntent)
        .setOngoing(true)
        .setAutoCancel(false)
        .setSilent(true) // 소리는 끄되
        .setOnlyAlertOnce(false) // [중요] 아이콘 변화를 반영하려면 false로 설정 (재미나이 조언)
        .build()

      manager.notify(NOTIFICATION_ID, notification)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SHOW_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun dismissNotification(promise: Promise) {
    try {
      notificationManager?.cancel(NOTIFICATION_ID)
      mediaSession?.release()
      mediaSession = null
      setInstance(null)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("DISMISS_ERROR", e.message, e)
    }
  }

  fun getMediaSession(): MediaSessionCompat? = mediaSession

  fun sendEvent(eventName: String, params: Any?) {
    try {
      android.util.Log.d("MediaSessionModule", "sendEvent: $eventName")
      val context = reactApplicationContext
      if (context == null) {
        android.util.Log.w("MediaSessionModule", "reactApplicationContext is null")
        return
      }
      context
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit(eventName, params)
      android.util.Log.d("MediaSessionModule", "Event sent: $eventName")
    } catch (e: Exception) {
      android.util.Log.e("MediaSessionModule", "Error sending event: $eventName", e)
    }
  }
}

