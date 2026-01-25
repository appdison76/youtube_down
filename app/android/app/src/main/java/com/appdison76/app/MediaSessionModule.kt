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

  private fun getTransparentIcon(context: Context, resourceId: Int, alpha: Int): IconCompat {
    val drawable = ContextCompat.getDrawable(context, resourceId)?.mutate()
      ?: return IconCompat.createWithResource(context, resourceId)

    val width = drawable.intrinsicWidth.coerceAtLeast(1)
    val height = drawable.intrinsicHeight.coerceAtLeast(1)
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)

    drawable.setBounds(0, 0, width, height)
    drawable.alpha = alpha
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

      val mediaButtonIntent = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
        setClass(context, MediaButtonReceiver::class.java)
      }
      val mediaButtonPendingIntent = PendingIntent.getBroadcast(
        context,
        0,
        mediaButtonIntent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )

      mediaSession = MediaSessionCompat(context, "MelodySnapMediaSession", null, mediaButtonPendingIntent).apply {
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
        setSessionActivity(pendingIntent)
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

      val metadataBuilder = MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)

      if (duration != null) {
        metadataBuilder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration.toLong())
      }

      session.setMetadata(metadataBuilder.build())

      if (thumbnailUrl != null && thumbnailUrl.isNotEmpty()) {
        executor.execute {
          try {
            val url = URL(thumbnailUrl)
            val connection = url.openConnection()
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            val bitmap = BitmapFactory.decodeStream(connection.getInputStream())
            if (bitmap != null) {
              val updatedMetadataBuilder = MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                .putBitmap(MediaMetadataCompat.METADATA_KEY_ART, bitmap)

              if (duration != null) {
                updatedMetadataBuilder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration.toLong())
              }

              session.setMetadata(updatedMetadataBuilder.build())
            }
          } catch (e: Exception) {
            // 썸네일 로드 실패 시 무시
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

      val state = if (isPlaying) {
        PlaybackStateCompat.STATE_PLAYING
      } else {
        PlaybackStateCompat.STATE_PAUSED
      }

      val playbackSpeed = if (isPlaying) 1.0f else 0.0f

      val playbackPosition = if (position != null && position >= 0) {
        position.toLong()
      } else {
        PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN
      }

      val updateTime = if (isPlaying) SystemClock.elapsedRealtime() else 0L

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

      session.setPlaybackState(playbackState)
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

      val intent = try {
        Intent().apply {
          setClassName(context.packageName, "com.appdison76.app.MainActivity")
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
          action = Intent.ACTION_MAIN
          addCategory(Intent.CATEGORY_LAUNCHER)
        }
      } catch (e: Exception) {
        android.util.Log.e("MediaSessionModule", "MainActivity not found: ${e.message}")
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
      val actions = playbackState?.actions ?: 0L

      val canShowPrevious = actions and PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS != 0L
      val canShowNext = actions and PlaybackStateCompat.ACTION_SKIP_TO_NEXT != 0L

      val notificationBuilder = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_media_play)
        .setContentTitle(metadata?.getString(MediaMetadataCompat.METADATA_KEY_TITLE) ?: "재생 중")
        .setContentText(metadata?.getString(MediaMetadataCompat.METADATA_KEY_ARTIST) ?: "MelodySnap")
        .setLargeIcon(metadata?.getBitmap(MediaMetadataCompat.METADATA_KEY_ART))

      var actionIndex = 0
      val compactViewIndices = mutableListOf<Int>()

      if (canShowPrevious) {
        notificationBuilder.addAction(
          android.R.drawable.ic_media_previous,
          "이전",
          MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
        )
        compactViewIndices.add(actionIndex)
        actionIndex++
      }

      val playPauseIndex = actionIndex
      notificationBuilder.addAction(
        if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
        if (isPlaying) "일시정지" else "재생",
        MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_PLAY_PAUSE)
      )
      compactViewIndices.add(playPauseIndex)
      actionIndex++

      if (canShowNext) {
        notificationBuilder.addAction(
          android.R.drawable.ic_media_next,
          "다음",
          MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_SKIP_TO_NEXT)
        )
        compactViewIndices.add(actionIndex)
        actionIndex++
      }

      val mediaStyle = MediaStyle()
        .setMediaSession(session.sessionToken)

      when (compactViewIndices.size) {
        1 -> mediaStyle.setShowActionsInCompactView(compactViewIndices[0])
        2 -> mediaStyle.setShowActionsInCompactView(0, 1)
        3 -> mediaStyle.setShowActionsInCompactView(0, 1, 2)
      }

      notificationBuilder.setStyle(mediaStyle)

      val notification = notificationBuilder
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setContentIntent(pendingIntent)
        .setOngoing(true)
        .setAutoCancel(false)
        .setSilent(true)
        .setOnlyAlertOnce(false)
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
    } catch (e: Exception) {
      android.util.Log.e("MediaSessionModule", "Error sending event: $eventName", e)
    }
  }
}
