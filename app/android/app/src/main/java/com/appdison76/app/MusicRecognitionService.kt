package com.appdison76.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * 백그라운드에서 음악 인식을 수행하는 Foreground Service
 * Shazam처럼 백그라운드에서 계속 인식하고 결과가 나오면 알림을 보냅니다.
 * 
 * 참고: 실제 인식은 React Native 쪽에서 ACRCloudModule을 통해 수행되며,
 * 이 서비스는 백그라운드에서 인식이 계속되도록 유지하는 역할만 합니다.
 */
class MusicRecognitionService : Service() {
    private val CHANNEL_ID = "music_recognition_channel"
    private val NOTIFICATION_ID = 1001
    
    companion object {
        private const val TAG = "MusicRecognitionService"
        const val ACTION_START = "com.appdison76.app.START_RECOGNITION"
        const val ACTION_STOP = "com.appdison76.app.STOP_RECOGNITION"
        
        @JvmStatic
        fun startService(context: Context) {
            val intent = Intent(context, MusicRecognitionService::class.java)
            intent.action = ACTION_START
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
        
        @JvmStatic
        fun stopService(context: Context) {
            val intent = Intent(context, MusicRecognitionService::class.java)
            intent.action = ACTION_STOP
            context.stopService(intent)
        }
    }
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        createNotificationChannel()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                Log.d(TAG, "Starting recognition service")
                // Android 14+ (API 34+) 에서는 foregroundServiceType을 명시해야 함
                if (Build.VERSION.SDK_INT >= 34) {
                    try {
                        startForeground(NOTIFICATION_ID, createNotification("음악 인식 중..."), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
                        Log.d(TAG, "✅ Foreground Service started with microphone type (Android 14+)")
                    } catch (e: Exception) {
                        Log.e(TAG, "❌ Failed to start foreground service with microphone type: ${e.message}")
                        // 폴백: 일반 foreground service로 시작
                        startForeground(NOTIFICATION_ID, createNotification("음악 인식 중..."))
                        Log.d(TAG, "✅ Foreground Service started (fallback)")
                    }
                } else {
                    startForeground(NOTIFICATION_ID, createNotification("음악 인식 중..."))
                    Log.d(TAG, "✅ Foreground Service started (Android < 14)")
                }
            }
            ACTION_STOP -> {
                Log.d(TAG, "Stopping recognition service")
                stopForeground(true)
                stopSelf()
            }
        }
        return START_STICKY
    }
    
    override fun onBind(intent: Intent?): IBinder? {
        return null
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "음악 인식",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "백그라운드에서 음악을 인식합니다"
                setShowBadge(false)
            }
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun createNotification(text: String): Notification {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val stopIntent = Intent(this, MusicRecognitionService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this,
            0,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("음악 인식")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(pendingIntent)
            .addAction(
                android.R.drawable.ic_media_pause,
                "중지",
                stopPendingIntent
            )
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service destroyed")
    }
}
