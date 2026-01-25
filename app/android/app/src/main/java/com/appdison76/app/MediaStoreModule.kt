package com.appdison76.app

import android.content.ContentValues
import android.content.Intent
import android.content.ClipData
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import java.io.File
import java.io.FileInputStream
import java.io.OutputStream
import android.database.Cursor
import java.net.URLDecoder
import androidx.core.content.FileProvider

class MediaStoreModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String {
    return "MediaStoreModule"
  }

  @ReactMethod
  fun getContentUri(fileUri: String, promise: Promise) {
    try {
      Log.d("MediaStoreModule", "========== getContentUri called ==========")
      Log.d("MediaStoreModule", "fileUri: $fileUri")

      val context = reactApplicationContext ?: run {
        Log.e("MediaStoreModule", "❌ React context is null!")
        promise.reject("CONTEXT_ERROR", "React context is null", null)
        return
      }

      // file:// URI에서 실제 경로 추출
      var filePath = fileUri
      if (filePath.startsWith("file://")) {
        filePath = filePath.replace("file://", "")
      }

      // URL 디코딩
      try {
        filePath = URLDecoder.decode(filePath, "UTF-8")
      } catch (e: Exception) {
        Log.w("MediaStoreModule", "Could not decode file path: ${e.message}")
      }

      val file = File(filePath)

      if (!file.exists()) {
        Log.e("MediaStoreModule", "❌ File does not exist: ${file.absolutePath}")
        promise.reject("FILE_NOT_FOUND", "File does not exist: ${file.absolutePath}", null)
        return
      }

      // FileProvider를 사용하여 content:// URI 생성
      val contentUri = FileProvider.getUriForFile(
        context,
        "${context.packageName}.fileprovider",
        file
      )

      Log.d("MediaStoreModule", "✅ Content URI created: $contentUri")
      promise.resolve(contentUri.toString())
    } catch (e: Exception) {
      Log.e("MediaStoreModule", "❌ Error getting content URI", e)
      promise.reject("URI_ERROR", "Failed to get content URI: ${e.message}", e)
    }
  }

  @ReactMethod
  fun saveToMediaStore(fileUri: String, fileName: String, isVideo: Boolean, videoId: String?, promise: Promise) {
    try {
      Log.d("MediaStoreModule", "========== saveToMediaStore called ==========")
      Log.d("MediaStoreModule", "Parameters: fileUri=$fileUri, fileName=$fileName, isVideo=$isVideo, videoId=$videoId")

      val context = reactApplicationContext ?: run {
        Log.e("MediaStoreModule", "❌ React context is null!")
        promise.reject("CONTEXT_ERROR", "React context is null", null)
        return
      }

      Log.d("MediaStoreModule", "React context is available")
      Log.d("MediaStoreModule", "Saving file: $fileUri, fileName: $fileName, isVideo: $isVideo")

      // 파일 URI를 실제 파일 경로로 변환
      var filePath = fileUri
      if (filePath.startsWith("file://")) {
        filePath = filePath.replace("file://", "")
      }

      try {
        filePath = java.net.URLDecoder.decode(filePath, "UTF-8")
        Log.d("MediaStoreModule", "Decoded file path: $filePath")
      } catch (e: Exception) {
        Log.w("MediaStoreModule", "Could not decode file path, using original: ${e.message}")
      }

      val sourceFile = File(filePath)

      Log.d("MediaStoreModule", "Checking file existence: ${sourceFile.absolutePath}")
      Log.d("MediaStoreModule", "File exists: ${sourceFile.exists()}")

      if (!sourceFile.exists()) {
        Log.e("MediaStoreModule", "❌ Source file does not exist!")
        Log.e("MediaStoreModule", "Attempted path: ${sourceFile.absolutePath}")
        Log.e("MediaStoreModule", "Original URI: $fileUri")
        promise.reject("FILE_NOT_FOUND", "Source file does not exist: ${sourceFile.absolutePath}", null)
        return
      }

      Log.d("MediaStoreModule", "Source file exists: ${sourceFile.absolutePath}, size: ${sourceFile.length()}")

      val mimeType = if (isVideo) {
        when (fileName.substringAfterLast('.').lowercase()) {
          "mp4" -> "video/mp4"
          "mov" -> "video/quicktime"
          "avi" -> "video/x-msvideo"
          "mkv" -> "video/x-matroska"
          else -> "video/mp4"
        }
      } else {
        when (fileName.substringAfterLast('.').lowercase()) {
          "m4a" -> "audio/mp4"
          "mp3" -> "audio/mpeg"
          "aac" -> "audio/aac"
          "wav" -> "audio/wav"
          else -> "audio/mpeg"
        }
      }

      Log.d("MediaStoreModule", "MIME type: $mimeType")

      var cleanFileName = fileName
        .replace(Regex("[<>:\"/\\|?*]"), "_")
        .replace(Regex("\\s+"), "_")

      val lastDotIndex = cleanFileName.lastIndexOf('.')
      val baseName = if (lastDotIndex > 0) cleanFileName.substring(0, lastDotIndex) else cleanFileName
      val extension = if (lastDotIndex > 0 && lastDotIndex < cleanFileName.length - 1) {
        cleanFileName.substring(lastDotIndex + 1)
      } else {
        ""
      }

      val maxBaseNameLength = 200 - (if (extension.isNotEmpty()) extension.length + 1 else 0)
      val truncatedBaseName = baseName.take(maxBaseNameLength)

      cleanFileName = if (extension.isNotEmpty()) {
        "$truncatedBaseName.$extension"
      } else {
        truncatedBaseName
      }

      Log.d("MediaStoreModule", "Clean file name: $cleanFileName")

      val contentValues = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, cleanFileName)
        put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
        put(MediaStore.MediaColumns.RELATIVE_PATH, if (isVideo) {
          "Movies/YouTube Videos"
        } else {
          "Music/YouTube Audio"
        })
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
      }

      val collection = if (isVideo) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        } else {
          MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        }
      } else {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        } else {
          MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        }
      }

      Log.d("MediaStoreModule", "Collection URI: $collection")

      val resolver = context.contentResolver

      Log.d("MediaStoreModule", "Not checking for existing files - allowing duplicates with auto-renaming")

      val mediaUri = resolver.insert(collection, contentValues)

      if (mediaUri == null) {
        Log.e("MediaStoreModule", "Failed to insert into MediaStore. Collection: $collection, FileName: $cleanFileName")
        promise.reject("INSERT_FAILED", "Failed to create media entry in MediaStore. Collection: $collection", null)
        return
      }

      Log.d("MediaStoreModule", "Media URI created: $mediaUri")

      try {
        val inputStream = FileInputStream(sourceFile)
        val outputStream: OutputStream? = resolver.openOutputStream(mediaUri)

        if (outputStream == null) {
          inputStream.close()
          resolver.delete(mediaUri, null, null)
          promise.reject("OUTPUT_STREAM_ERROR", "Failed to open output stream", null)
          return
        }

        val buffer = ByteArray(8192)
        var bytesRead: Int
        var totalBytes = 0L

        while (inputStream.read(buffer).also { bytesRead = it } != -1) {
          outputStream.write(buffer, 0, bytesRead)
          totalBytes += bytesRead
        }

        outputStream.flush()
        outputStream.close()
        inputStream.close()

        Log.d("MediaStoreModule", "File copied successfully. Total bytes: $totalBytes")

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          try {
            contentValues.clear()
            contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
            val updateResult = resolver.update(mediaUri, contentValues, null, null)
            Log.d("MediaStoreModule", "IS_PENDING updated, result: $updateResult")
          } catch (e: Exception) {
            Log.e("MediaStoreModule", "Error updating IS_PENDING", e)
          }
        }

        Log.d("MediaStoreModule", "✅ File saved successfully! Resolving promise with URI: $mediaUri")
        promise.resolve(mediaUri.toString())
      } catch (e: Exception) {
        Log.e("MediaStoreModule", "Error copying file", e)
        try {
          resolver.delete(mediaUri, null, null)
        } catch (deleteError: Exception) {
          Log.e("MediaStoreModule", "Error deleting mediaUri after copy failure", deleteError)
        }
        promise.reject("COPY_ERROR", "Failed to copy file: ${e.message}", e)
      }
    } catch (e: Exception) {
      Log.e("MediaStoreModule", "Error saving to MediaStore", e)
      promise.reject("SAVE_ERROR", "Failed to save file: ${e.message}", e)
    }
  }

  @ReactMethod
  fun shareContentUri(contentUri: String, mimeType: String, fileName: String, promise: Promise) {
    try {
      val context = reactApplicationContext ?: run {
        Log.e("MediaStoreModule", "❌ React context is null!")
        promise.reject("CONTEXT_ERROR", "React context is null", null)
        return
      }

      val currentActivity = context.currentActivity
      if (currentActivity == null) {
        Log.e("MediaStoreModule", "❌ Current activity is null!")
        promise.reject("CONTEXT_ERROR", "Current activity is null", null)
        return
      }

      Log.d("MediaStoreModule", "Sharing content URI: $contentUri, mimeType: $mimeType, fileName: $fileName")

      val uri = Uri.parse(contentUri)

      val shareIntent = Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_SUBJECT, fileName)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
          clipData = ClipData.newUri(context.contentResolver, "Media", uri)
        }
      }

      val chooserIntent = Intent.createChooser(shareIntent, fileName).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
          clipData = ClipData.newUri(context.contentResolver, "Media", uri)
        }
      }

      currentActivity.startActivity(chooserIntent)

      Log.d("MediaStoreModule", "Share intent started successfully")
      promise.resolve(true)
    } catch (e: Exception) {
      Log.e("MediaStoreModule", "Error sharing content URI", e)
      promise.reject("SHARE_ERROR", "Failed to share file: ${e.message}", e)
    }
  }
}
