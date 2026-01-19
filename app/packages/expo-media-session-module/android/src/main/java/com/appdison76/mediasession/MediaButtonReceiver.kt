package com.appdison76.mediasession

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.view.KeyEvent

object MediaButtonReceiver {
  fun buildMediaButtonPendingIntent(
    context: Context,
    action: Long
  ): PendingIntent {
    val intent = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
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

