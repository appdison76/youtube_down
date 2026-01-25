package com.appdison76.app

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Log
import android.view.KeyEvent

class MediaButtonReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (Intent.ACTION_MEDIA_BUTTON == intent.action) {
      val keyEvent = intent.getParcelableExtra<KeyEvent>(Intent.EXTRA_KEY_EVENT) ?: return

      if (keyEvent.action != KeyEvent.ACTION_DOWN) {
        return
      }

      Log.d(TAG, "Media button pressed: ${keyEvent.keyCode}")

      // MediaSessionModule에서 인스턴스 가져오기
      val mediaSessionModule = MediaSessionModule.getInstance()
      val mediaSession = mediaSessionModule?.getMediaSession()

      if (mediaSession == null) {
        Log.w(TAG, "MediaSession is null")
        return
      }

      if (mediaSessionModule == null) {
        Log.w(TAG, "MediaSessionModule is null")
        return
      }

      try {
        // playbackState의 actions를 직접 확인
        val playbackState = mediaSession.controller.playbackState
        val availableActions = playbackState?.actions ?: 0L

        when (keyEvent.keyCode) {
          KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
            val state = mediaSession.controller.playbackState?.state
            Log.d(TAG, "Play/Pause button pressed, current state: $state")
            if (state == PlaybackStateCompat.STATE_PLAYING) {
              // transportControls를 호출하면 Callback이 자동으로 호출됨
              mediaSession.controller.transportControls.pause()
            } else {
              mediaSession.controller.transportControls.play()
            }
          }
          KeyEvent.KEYCODE_MEDIA_PLAY -> {
            Log.d(TAG, "Play button pressed")
            mediaSession.controller.transportControls.play()
          }
          KeyEvent.KEYCODE_MEDIA_PAUSE -> {
            Log.d(TAG, "Pause button pressed")
            mediaSession.controller.transportControls.pause()
          }
          KeyEvent.KEYCODE_MEDIA_NEXT -> {
            // ACTION_SKIP_TO_NEXT가 사용 가능한지 확인
            if (availableActions and PlaybackStateCompat.ACTION_SKIP_TO_NEXT == 0L) {
              Log.d(TAG, "Next action not available, ignoring")
              return
            }
            Log.d(TAG, "Next button pressed")
            // transportControls를 호출하면 Callback이 자동으로 호출됨
            mediaSession.controller.transportControls.skipToNext()
          }
          KeyEvent.KEYCODE_MEDIA_PREVIOUS -> {
            // ACTION_SKIP_TO_PREVIOUS가 사용 가능한지 확인
            if (availableActions and PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS == 0L) {
              Log.d(TAG, "Previous action not available, ignoring")
              return
            }
            Log.d(TAG, "Previous button pressed")
            mediaSession.controller.transportControls.skipToPrevious()
          }
          KeyEvent.KEYCODE_MEDIA_STOP -> {
            Log.d(TAG, "Stop button pressed")
            mediaSession.controller.transportControls.stop()
          }
        }
      } catch (e: Exception) {
        Log.e(TAG, "Error handling media button", e)
      }
    }
  }

  companion object {
    private const val TAG = "MediaButtonReceiver"

    fun buildMediaButtonPendingIntent(
      context: Context,
      action: Long
    ): PendingIntent {
      val intent = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
        setClass(context, MediaButtonReceiver::class.java)
        putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_DOWN, when (action) {
          PlaybackStateCompat.ACTION_PLAY_PAUSE -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
          PlaybackStateCompat.ACTION_SKIP_TO_NEXT -> KeyEvent.KEYCODE_MEDIA_NEXT
          PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
          PlaybackStateCompat.ACTION_STOP -> KeyEvent.KEYCODE_MEDIA_STOP
          else -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
        }))
      }
      return PendingIntent.getBroadcast(
        context,
        action.toInt(),
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
    }
  }
}
