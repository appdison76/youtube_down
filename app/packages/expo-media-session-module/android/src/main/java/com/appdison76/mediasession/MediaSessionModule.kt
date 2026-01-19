package com.appdison76.mediasession

import android.app.Notification
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
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.net.URL
import java.util.concurrent.Executors

class MediaSessionModule : Module() {
  private var mediaSession: MediaSessionCompat? = null
  private var notificationManager: NotificationManager? = null
  private val CHANNEL_ID = "audio-playback"
  private val NOTIFICATION_ID = 1
  private val executor = Executors.newSingleThreadExecutor()

  override fun definition() = ModuleDefinition {
    Name("MediaSessionModule")

    Function("initialize") { promise: Promise ->
      try {
        val context = appContext.reactContext ?: return@Function promise.reject("NO_CONTEXT", "No context available", null)
        
        notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        
        // 알림 채널 생성
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          val channel = NotificationChannel(
            CHANNEL_ID,
            "음악 재생",
            NotificationManager.IMPORTANCE_LOW
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

        mediaSession = MediaSessionCompat(context, "MeTubeMediaSession").apply {
          setCallback(object : MediaSessionCompat.Callback() {
            override fun onPlay() {
              sendEvent("play", null)
            }

            override fun onPause() {
              sendEvent("pause", null)
            }

            override fun onSkipToNext() {
              sendEvent("next", null)
            }

            override fun onSkipToPrevious() {
              sendEvent("previous", null)
            }

            override fun onStop() {
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

    Function("updateMetadata") { title: String, artist: String, thumbnailUrl: String?, promise: Promise ->
      try {
        val session = mediaSession ?: return@Function promise.reject("NO_SESSION", "MediaSession not initialized", null)
        
        val metadataBuilder = MediaMetadataCompat.Builder()
          .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
          .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
        
        // 썸네일 로드 (비동기)
        if (thumbnailUrl != null && thumbnailUrl.isNotEmpty()) {
          executor.execute {
            try {
              val url = URL(thumbnailUrl)
              val connection = url.openConnection()
              connection.connectTimeout = 5000
              connection.readTimeout = 5000
              val bitmap = BitmapFactory.decodeStream(connection.getInputStream())
              if (bitmap != null) {
                metadataBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, bitmap)
              }
            } catch (e: Exception) {
              // 썸네일 로드 실패 시 무시
            }
            session.setMetadata(metadataBuilder.build())
          }
        } else {
          session.setMetadata(metadataBuilder.build())
        }
        
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("UPDATE_ERROR", e.message, e)
      }
    }

    Function("updatePlaybackState") { isPlaying: Boolean, promise: Promise ->
      try {
        val session = mediaSession ?: return@Function promise.reject("NO_SESSION", "MediaSession not initialized", null)
        
        val state = if (isPlaying) {
          PlaybackStateCompat.STATE_PLAYING
        } else {
          PlaybackStateCompat.STATE_PAUSED
        }
        
        val playbackState = PlaybackStateCompat.Builder()
          .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
          .setActions(
            PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
            PlaybackStateCompat.ACTION_STOP
          )
          .build()
        
        session.setPlaybackState(playbackState)
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("UPDATE_ERROR", e.message, e)
      }
    }

    Function("showNotification") { promise: Promise ->
      try {
        val context = appContext.reactContext ?: return@Function promise.reject("NO_CONTEXT", "No context available", null)
        val session = mediaSession ?: return@Function promise.reject("NO_SESSION", "MediaSession not initialized", null)
        val manager = notificationManager ?: return@Function promise.reject("NO_MANAGER", "NotificationManager not initialized", null)
        
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
        
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
          .setSmallIcon(android.R.drawable.ic_media_play)
          .setContentTitle(metadata?.getString(MediaMetadataCompat.METADATA_KEY_TITLE) ?: "재생 중")
          .setContentText(metadata?.getString(MediaMetadataCompat.METADATA_KEY_ARTIST) ?: "MeTube")
          .setLargeIcon(metadata?.getBitmap(MediaMetadataCompat.METADATA_KEY_ART))
          .setStyle(
            MediaStyle()
              .setShowActionsInCompactView(0, 1, 2)
              .setMediaSession(session.sessionToken)
          )
          .addAction(
            android.R.drawable.ic_media_previous,
            "이전",
            MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
          )
          .addAction(
            if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
            if (isPlaying) "일시정지" else "재생",
            MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_PLAY_PAUSE)
          )
          .addAction(
            android.R.drawable.ic_media_next,
            "다음",
            MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_SKIP_TO_NEXT)
          )
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

    Function("dismissNotification") { promise: Promise ->
      try {
        notificationManager?.cancel(NOTIFICATION_ID)
        mediaSession?.release()
        mediaSession = null
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("DISMISS_ERROR", e.message, e)
      }
    }

    Events("play", "pause", "next", "previous", "stop")
  }
}

