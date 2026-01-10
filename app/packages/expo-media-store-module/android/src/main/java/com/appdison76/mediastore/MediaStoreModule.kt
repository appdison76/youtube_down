package com.appdison76.mediastore

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.File
import java.io.FileInputStream
import java.io.OutputStream

class MediaStoreModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MediaStoreModule")

    Function("saveToMediaStore") { fileUri: String, fileName: String, isVideo: Boolean, promise: Promise ->
      try {
        val context = appContext.reactContext ?: return@Function promise.reject("CONTEXT_ERROR", "React context is null", null)
        
        Log.d("MediaStoreModule", "Saving file: $fileUri, fileName: $fileName, isVideo: $isVideo")
        
        // 파일 URI를 실제 파일 경로로 변환
        val sourceFile = if (fileUri.startsWith("file://")) {
          File(fileUri.replace("file://", ""))
        } else {
          File(fileUri)
        }
        
        if (!sourceFile.exists()) {
          return@Function promise.reject("FILE_NOT_FOUND", "Source file does not exist: ${sourceFile.absolutePath}", null)
        }
        
        Log.d("MediaStoreModule", "Source file exists: ${sourceFile.absolutePath}, size: ${sourceFile.length()}")
        
        // MIME 타입 결정
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
        
        // MediaStore에 파일 저장
        val contentValues = ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
          put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
          put(MediaStore.MediaColumns.RELATIVE_PATH, if (isVideo) {
            "Movies/YouTube Videos"
          } else {
            "Music/YouTube Audio"
          })
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
        val mediaUri = resolver.insert(collection, contentValues)
        
        if (mediaUri == null) {
          return@Function promise.reject("INSERT_FAILED", "Failed to create media entry in MediaStore", null)
        }
        
        Log.d("MediaStoreModule", "Media URI created: $mediaUri")
        
        // 파일 내용 복사
        try {
          val inputStream = FileInputStream(sourceFile)
          val outputStream: OutputStream? = resolver.openOutputStream(mediaUri)
          
          if (outputStream == null) {
            inputStream.close()
            resolver.delete(mediaUri, null, null)
            return@Function promise.reject("OUTPUT_STREAM_ERROR", "Failed to open output stream", null)
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
          
          // MediaStore에 파일이 추가되었음을 알림
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            contentValues.clear()
            contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(mediaUri, contentValues, null, null)
          }
          
          promise.resolve(mediaUri.toString())
        } catch (e: Exception) {
          Log.e("MediaStoreModule", "Error copying file", e)
          resolver.delete(mediaUri, null, null)
          promise.reject("COPY_ERROR", "Failed to copy file: ${e.message}", e)
        }
      } catch (e: Exception) {
        Log.e("MediaStoreModule", "Error saving to MediaStore", e)
        promise.reject("SAVE_ERROR", "Failed to save file: ${e.message}", e)
      }
    }
  }
}



