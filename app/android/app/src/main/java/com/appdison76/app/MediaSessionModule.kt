package com.appdison76.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import com.appdison76.app.MediaButtonReceiver
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.net.URL
import java.util.concurrent.Executors

class MediaSessionModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private var mediaSession: MediaSessionCompat? = null
  private var notificationManager: NotificationManager? = null
  private val CHANNEL_ID = "audio-playback"
  private val NOTIFICATION_ID = 1
  private val executor = Executors.newSingleThreadExecutor()
  private var canGoNext: Boolean = true
  private var canGoPrevious: Boolean = true

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
      val intent = Intent(context, context.javaClass)
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
        })
        setFlags(
          MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
          MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        )
        isActive = true
      }

      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("INIT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun updateMetadata(title: String, artist: String, thumbnailUrl: String?, promise: Promise) {
    try {
      val session = mediaSession ?: run {
        promise.reject("NO_SESSION", "MediaSession not initialized", null)
        return
      }
      
      // 제목과 아티스트는 즉시 설정 (썸네일 로드 전에)
      val metadataBuilder = MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
      
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
              val updatedMetadata = MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                .putBitmap(MediaMetadataCompat.METADATA_KEY_ART, bitmap)
                .build()
              session.setMetadata(updatedMetadata)
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
  fun updatePlaybackState(isPlaying: Boolean, canGoNext: Boolean, canGoPrevious: Boolean, promise: Promise) {
    try {
      val session = mediaSession ?: run {
        promise.reject("NO_SESSION", "MediaSession not initialized", null)
        return
      }
      
      // 상태 저장 (MediaButtonReceiver에서 확인용)
      this.canGoNext = canGoNext
      this.canGoPrevious = canGoPrevious
      
      val state = if (isPlaying) {
        PlaybackStateCompat.STATE_PLAYING
      } else {
        PlaybackStateCompat.STATE_PAUSED
      }
      
      // Actions를 동적으로 설정 (버튼 표시 여부 결정)
      var actions = PlaybackStateCompat.ACTION_PLAY_PAUSE or
                    PlaybackStateCompat.ACTION_PLAY or
                    PlaybackStateCompat.ACTION_PAUSE or
                    PlaybackStateCompat.ACTION_STOP
      
      if (canGoNext) {
        actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_NEXT
      }
      
      if (canGoPrevious) {
        actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
      }
      
      val playbackState = PlaybackStateCompat.Builder()
        .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
        .setActions(actions)
        .build()
      
      session.setPlaybackState(playbackState)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("UPDATE_ERROR", e.message, e)
    }
  }
  
  fun getCanGoNext(): Boolean = canGoNext
  fun getCanGoPrevious(): Boolean = canGoPrevious

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
      
      val intent = Intent(context, context.javaClass)
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
        .setSilent(true)
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

