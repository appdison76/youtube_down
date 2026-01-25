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
        // 알림 터치 시 앱을 열기 위한 Intent 생성
        val intent = try {
          Intent().apply {
            setClassName(context.packageName, "com.appdison76.app.MainActivity")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            action = Intent.ACTION_MAIN
            addCategory(Intent.CATEGORY_LAUNCHER)
          }
        } catch (e: Exception) {
          context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
          } ?: Intent(context, context.javaClass).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
          }
        }
        val pendingIntent = PendingIntent.getActivity(
          context,
          0,
          intent,
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
          } else {
            PendingIntent.FLAG_UPDATE_CURRENT
          }
        )

        mediaSession = MediaSessionCompat(context, "MelodySnapMediaSession").apply {
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

            override fun onSeekTo(pos: Long) {
              sendEvent("seek", mapOf("position" to pos))
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

    Function("updateMetadata") { title: String, artist: String, thumbnailUrl: String?, duration: Double?, promise: Promise ->
      try {
        val session = mediaSession ?: return@Function promise.reject("NO_SESSION", "MediaSession not initialized", null)
        
        val metadataBuilder = MediaMetadataCompat.Builder()
          .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
          .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
        
        // duration 추가 (트랙바 표시를 위해 필요)
        if (duration != null) {
          metadataBuilder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration.toLong())
        }
        
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
                // 썸네일 로드 완료 후 메타데이터 업데이트 (duration도 유지)
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
        } else {
          session.setMetadata(metadataBuilder.build())
        }
        
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("UPDATE_ERROR", e.message, e)
      }
    }

    AsyncFunction("updatePlaybackState") { isPlaying: Boolean, canGoNext: Boolean, canGoPrevious: Boolean, position: Double?, duration: Double?, shouldUpdateNotification: Boolean, promise: Promise ->
      try {
        val session = mediaSession ?: return@AsyncFunction promise.reject("NO_SESSION", "MediaSession not initialized", null)
        
        val state = if (isPlaying) {
          PlaybackStateCompat.STATE_PLAYING
        } else {
          PlaybackStateCompat.STATE_PAUSED
        }
        
        // position과 duration이 있으면 사용, 없으면 UNKNOWN
        val playbackPosition = if (position != null && position >= 0) {
          position.toLong()
        } else {
          PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN
        }
        val playbackSpeed = if (isPlaying) 1.0f else 0.0f
        
        // updateTime: position이 업데이트된 시점의 타임스탬프
        // 재생 중일 때: 시스템이 자동으로 position + (현재시간 - updateTime) * speed로 계산
        // 일시정지일 때: position이 고정됨 (speed = 0)
        // 재생 중일 때는 updateTime을 현재 시간으로 설정하고, position을 자주 업데이트하면
        // 시스템이 자동으로 position + (현재시간 - updateTime) * speed로 계산하여 트랙바를 업데이트함
        val updateTime = System.currentTimeMillis()
        
        // 액션 설정
        var actions = PlaybackStateCompat.ACTION_PLAY or
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
        
        // PlaybackStateCompat가 업데이트되면 트랙바는 자동으로 갱신됨
        // 하지만 알림도 주기적으로 업데이트해야 트랙바가 제대로 표시됨
        // shouldUpdateNotification이 true일 때만 알림을 업데이트 (throttling)
        if (shouldUpdateNotification) {
          try {
          val manager = notificationManager
          val context = appContext.reactContext
          if (manager != null && context != null) {
            val metadata = session.controller.metadata
            val isPlayingState = state == PlaybackStateCompat.STATE_PLAYING
            val actions = playbackState.actions
            
            val canShowPrevious = actions and PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS != 0L
            val canShowNext = actions and PlaybackStateCompat.ACTION_SKIP_TO_NEXT != 0L
            
            // 알림 터치 시 앱을 열기 위한 Intent 생성
            val intent = try {
              Intent().apply {
                setClassName(context.packageName, "com.appdison76.app.MainActivity")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                action = Intent.ACTION_MAIN
                addCategory(Intent.CATEGORY_LAUNCHER)
              }
            } catch (e: Exception) {
              context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
              } ?: Intent().apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
              }
            }
            val pendingIntent = PendingIntent.getActivity(
              context,
              NOTIFICATION_ID,
              intent,
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
              } else {
                PendingIntent.FLAG_UPDATE_CURRENT
              }
            )
            
            // MediaButtonReceiver를 위한 PendingIntent 생성 함수
            fun buildMediaButtonPendingIntent(action: Long): PendingIntent {
              val mediaButtonIntent = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
                setClassName(context.packageName, "com.appdison76.app.MediaButtonReceiver")
                putExtra(Intent.EXTRA_KEY_EVENT, android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, when (action) {
                  PlaybackStateCompat.ACTION_PLAY_PAUSE -> android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
                  PlaybackStateCompat.ACTION_SKIP_TO_NEXT -> android.view.KeyEvent.KEYCODE_MEDIA_NEXT
                  PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS -> android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS
                  PlaybackStateCompat.ACTION_STOP -> android.view.KeyEvent.KEYCODE_MEDIA_STOP
                  else -> android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
                }))
              }
              return PendingIntent.getBroadcast(
                context,
                action.toInt(),
                mediaButtonIntent,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                  PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                } else {
                  PendingIntent.FLAG_UPDATE_CURRENT
                }
              )
            }
            
            val notificationBuilder = NotificationCompat.Builder(context, CHANNEL_ID)
              .setSmallIcon(android.R.drawable.ic_media_play)
              .setContentTitle(metadata?.getString(MediaMetadataCompat.METADATA_KEY_TITLE) ?: "재생 중")
              .setContentText(metadata?.getString(MediaMetadataCompat.METADATA_KEY_ARTIST) ?: "MelodySnap")
              .setLargeIcon(metadata?.getBitmap(MediaMetadataCompat.METADATA_KEY_ART))
            
            // 버튼을 조건부로 추가
            var actionIndex = 0
            val compactViewIndices = mutableListOf<Int>()
            
            if (canShowPrevious) {
              notificationBuilder.addAction(
                android.R.drawable.ic_media_previous,
                "이전",
                buildMediaButtonPendingIntent(PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
              )
              compactViewIndices.add(actionIndex)
              actionIndex++
            }
            
            val playPauseIndex = actionIndex
            notificationBuilder.addAction(
              if (isPlayingState) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
              if (isPlayingState) "일시정지" else "재생",
              buildMediaButtonPendingIntent(PlaybackStateCompat.ACTION_PLAY_PAUSE)
            )
            compactViewIndices.add(playPauseIndex)
            actionIndex++
            
            if (canShowNext) {
              notificationBuilder.addAction(
                android.R.drawable.ic_media_next,
                "다음",
                buildMediaButtonPendingIntent(PlaybackStateCompat.ACTION_SKIP_TO_NEXT)
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
              .build()
            
            manager.notify(NOTIFICATION_ID, notification)
          }
          } catch (e: Exception) {
            // 알림 업데이트 실패해도 재생 상태는 업데이트되었으므로 계속 진행
          }
        }
        
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
        
        // 알림 터치 시 앱을 열기 위한 Intent 생성
        // 패키지 이름을 명시적으로 설정하여 확실하게 작동하도록 함
        val intent = try {
          Intent().apply {
            setClassName(context.packageName, "com.appdison76.app.MainActivity")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            action = Intent.ACTION_MAIN
            addCategory(Intent.CATEGORY_LAUNCHER)
          }
        } catch (e: Exception) {
          // MainActivity를 찾을 수 없으면 패키지 런처 Intent 사용
          context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
          } ?: Intent().apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
          }
        }
        
        // requestCode를 고유하게 설정 (NOTIFICATION_ID 사용)
        val pendingIntent = PendingIntent.getActivity(
          context,
          NOTIFICATION_ID,
          intent,
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
          } else {
            PendingIntent.FLAG_UPDATE_CURRENT
          }
        )

        val metadata = session.controller.metadata
        val playbackState = session.controller.playbackState
        
        val isPlaying = playbackState?.state == PlaybackStateCompat.STATE_PLAYING
        
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
          .setSmallIcon(android.R.drawable.ic_media_play)
          .setContentTitle(metadata?.getString(MediaMetadataCompat.METADATA_KEY_TITLE) ?: "재생 중")
          .setContentText(metadata?.getString(MediaMetadataCompat.METADATA_KEY_ARTIST) ?: "MelodySnap")
          .setLargeIcon(metadata?.getBitmap(MediaMetadataCompat.METADATA_KEY_ART))
          .setStyle(
            MediaStyle()
              .setShowActionsInCompactView(0, 1, 2)
              .setMediaSession(session.sessionToken)
              .setShowCancelButton(false)
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
          .setPriority(NotificationCompat.PRIORITY_LOW)
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

    Events("play", "pause", "next", "previous", "stop", "seek")
  }
}

