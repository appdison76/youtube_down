package com.appdison76.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * 백그라운드 음악 재생을 유지하는 Foreground Service (미디어 재생 타입)
 * Expo AV로 실제 재생은 하며, 이 서비스는 Android가 백그라운드에서 재생을 죽이지 않도록 유지합니다.
 */
class AudioPlaybackService : Service() {
    private val CHANNEL_ID = "audio_playback_channel"
    private val NOTIFICATION_ID = 1002

    companion object {
        private const val TAG = "AudioPlaybackService"
        const val ACTION_START = "com.appdison76.app.START_PLAYBACK"
        const val ACTION_UPDATE = "com.appdison76.app.UPDATE_PLAYBACK"
        const val ACTION_STOP = "com.appdison76.app.STOP_PLAYBACK"
        const val EXTRA_TITLE = "title"
        const val EXTRA_ARTIST = "artist"

        @JvmStatic
        fun startService(context: Context, title: String? = null, artist: String? = null) {
            val intent = Intent(context, AudioPlaybackService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_TITLE, title ?: "")
                putExtra(EXTRA_ARTIST, artist ?: "")
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        @JvmStatic
        fun updateNotification(context: Context, title: String?, artist: String?) {
            val intent = Intent(context, AudioPlaybackService::class.java).apply {
                action = ACTION_UPDATE
                putExtra(EXTRA_TITLE, title ?: "")
                putExtra(EXTRA_ARTIST, artist ?: "")
            }
            context.startService(intent)
        }

        @JvmStatic
        fun stopService(context: Context) {
            val intent = Intent(context, AudioPlaybackService::class.java).apply {
                action = ACTION_STOP
            }
            context.stopService(intent)
        }
    }

    private var currentTitle: String = ""
    private var currentArtist: String = ""
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                currentTitle = intent.getStringExtra(EXTRA_TITLE) ?: ""
                currentArtist = intent.getStringExtra(EXTRA_ARTIST) ?: ""
                Log.d(TAG, "Starting playback service: $currentTitle - $currentArtist")
                acquireWakeLock()
                startForegroundWithType()
            }
            ACTION_UPDATE -> {
                currentTitle = intent.getStringExtra(EXTRA_TITLE) ?: ""
                currentArtist = intent.getStringExtra(EXTRA_ARTIST) ?: ""
                Log.d(TAG, "Updating notification: $currentTitle - $currentArtist")
                val notificationManager = getSystemService(NotificationManager::class.java)
                notificationManager.notify(NOTIFICATION_ID, createNotification(currentTitle, currentArtist))
            }
            ACTION_STOP -> {
                Log.d(TAG, "Stopping playback service")
                releaseWakeLock()
                stopForeground(true)
                stopSelf()
            }
        }
        return START_STICKY
    }

    private fun startForegroundWithType() {
        if (Build.VERSION.SDK_INT >= 34) {
            try {
                startForeground(
                    NOTIFICATION_ID,
                    createNotification(currentTitle, currentArtist),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                )
                Log.d(TAG, "Foreground Service started with mediaPlayback type (Android 14+)")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start with mediaPlayback type: ${e.message}, fallback")
                startForeground(NOTIFICATION_ID, createNotification(currentTitle, currentArtist))
            }
        } else {
            startForeground(NOTIFICATION_ID, createNotification(currentTitle, currentArtist))
            Log.d(TAG, "Foreground Service started (Android < 14)")
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$TAG::playback").apply {
            setReferenceCounted(false)
            acquire(10 * 60 * 60 * 1000L) // 최대 10시간 (재생 유지용)
        }
        Log.d(TAG, "WakeLock acquired")
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.d(TAG, "WakeLock released")
                }
            }
            wakeLock = null
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing WakeLock", e)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "음악 재생",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "백그라운드에서 음악을 재생합니다"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun createNotification(title: String, artist: String): Notification {
        val displayText = when {
            title.isNotEmpty() && artist.isNotEmpty() -> "$title - $artist"
            title.isNotEmpty() -> title
            else -> "음악 재생 중"
        }
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPending = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stopIntent = Intent(this, AudioPlaybackService::class.java).apply { action = ACTION_STOP }
        val stopPending = PendingIntent.getService(
            this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("음악 재생")
            .setContentText(displayText)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(openPending)
            .addAction(android.R.drawable.ic_media_pause, "중지", stopPending)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
    }

    override fun onDestroy() {
        releaseWakeLock()
        super.onDestroy()
        Log.d(TAG, "Service destroyed")
    }
}
