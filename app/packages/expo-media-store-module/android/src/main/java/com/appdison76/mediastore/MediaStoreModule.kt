package com.appdison76.mediastore

import android.content.ContentValues
import android.content.Intent
import android.content.ClipData
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Log
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.File
import java.io.FileInputStream
import java.io.OutputStream
import java.net.URLDecoder

class MediaStoreModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MediaStoreModule")

    AsyncFunction("getContentUri") { fileUri: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: return@AsyncFunction promise.reject("CONTEXT_ERROR", "React context is null", null)
        
        Log.d("MediaStoreModule", "========== getContentUri called ==========")
        Log.d("MediaStoreModule", "fileUri: $fileUri")
        
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
          return@AsyncFunction promise.reject("FILE_NOT_FOUND", "File does not exist: ${file.absolutePath}", null)
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

    AsyncFunction("saveToMediaStore") { fileUri: String, fileName: String, isVideo: Boolean, videoId: String?, promise: Promise ->
      try {
        val context = appContext.reactContext ?: return@AsyncFunction promise.reject("CONTEXT_ERROR", "React context is null", null)
        
        Log.d("MediaStoreModule", "Saving file: $fileUri, fileName: $fileName, isVideo: $isVideo, videoId: $videoId")
        
        // DISPLAY_NAME 끝에 videoId 추가 (검색용)
        val displayNameWithVideoId = if (!videoId.isNullOrBlank()) {
          // 파일 확장자 앞에 videoId 추가: "파일명_videoId.mp4"
          val lastDotIndex = fileName.lastIndexOf('.')
          if (lastDotIndex > 0) {
            val nameWithoutExt = fileName.substring(0, lastDotIndex)
            val extension = fileName.substring(lastDotIndex)
            "${nameWithoutExt}_${videoId}${extension}"
          } else {
            "${fileName}_${videoId}"
          }
        } else {
          fileName
        }
        
        Log.d("MediaStoreModule", "Display name with videoId: $displayNameWithVideoId")
        
        // 파일 URI를 실제 파일 경로로 변환
        val sourceFile = if (fileUri.startsWith("file://")) {
          File(fileUri.replace("file://", ""))
        } else {
          File(fileUri)
        }
        
        if (!sourceFile.exists()) {
          return@AsyncFunction promise.reject("FILE_NOT_FOUND", "Source file does not exist: ${sourceFile.absolutePath}", null)
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
          put(MediaStore.MediaColumns.DISPLAY_NAME, displayNameWithVideoId)
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
          return@AsyncFunction promise.reject("INSERT_FAILED", "Failed to create media entry in MediaStore", null)
        }
        
        Log.d("MediaStoreModule", "Media URI created: $mediaUri")
        
        // 파일 내용 복사
        try {
          val inputStream = FileInputStream(sourceFile)
          val outputStream: OutputStream? = resolver.openOutputStream(mediaUri)
          
          if (outputStream == null) {
            inputStream.close()
            resolver.delete(mediaUri, null, null)
            return@AsyncFunction promise.reject("OUTPUT_STREAM_ERROR", "Failed to open output stream", null)
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

    AsyncFunction("getContentUriByVideoId") { videoId: String, isVideo: Boolean, promise: Promise ->
      try {
        val context = appContext.reactContext ?: return@AsyncFunction promise.reject("CONTEXT_ERROR", "React context is null", null)
        
        Log.d("MediaStoreModule", "Searching for videoId: $videoId, isVideo: $isVideo")
        
        val resolver = context.contentResolver
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
        
        // DISPLAY_NAME 끝에 videoId가 붙은 파일 검색
        // 예: "파일명_videoId.mp4" 또는 "파일명_videoId"
        val selection = "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ?"
        val selectionArgs = arrayOf("%_$videoId%")
        
        val projection = arrayOf(
          MediaStore.MediaColumns._ID,
          MediaStore.MediaColumns.DISPLAY_NAME
        )
        
        Log.d("MediaStoreModule", "Querying MediaStore: collection=$collection, selection=$selection, videoId=$videoId")
        
        val cursor = resolver.query(
          collection,
          projection,
          selection,
          selectionArgs,
          "${MediaStore.MediaColumns.DATE_ADDED} DESC" // 최신순
        )
        
        if (cursor == null) {
          Log.e("MediaStoreModule", "❌ Cursor is null")
          return@AsyncFunction promise.reject("QUERY_ERROR", "Failed to query MediaStore", null)
        }
        
        try {
          if (cursor.moveToFirst()) {
            val idColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
            val displayNameColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
            
            val id = cursor.getLong(idColumn)
            val displayName = cursor.getString(displayNameColumn)
            
            val contentUri = Uri.withAppendedPath(collection, id.toString())
            
            Log.d("MediaStoreModule", "✅ Found file in external storage: $displayName, URI: $contentUri")
            promise.resolve(contentUri.toString())
          } else {
            Log.w("MediaStoreModule", "⚠️ No file found with videoId: $videoId")
            promise.reject("NOT_FOUND", "No file found in external storage with videoId: $videoId", null)
          }
        } finally {
          cursor.close()
        }
      } catch (e: Exception) {
        Log.e("MediaStoreModule", "Error in getContentUriByVideoId: ${e.message}", e)
        promise.reject("QUERY_ERROR", "Failed to find file by videoId: ${e.message}", e)
      }
    }

    AsyncFunction("shareContentUri") { contentUri: String, mimeType: String, fileName: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: return@AsyncFunction promise.reject("CONTEXT_ERROR", "React context is null", null)
        
        Log.d("MediaStoreModule", "Sharing content URI: $contentUri, mimeType: $mimeType, fileName: $fileName")
        
        val uri = Uri.parse(contentUri)
        
        // Intent 생성
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
          type = mimeType
          putExtra(Intent.EXTRA_STREAM, uri)
          putExtra(Intent.EXTRA_SUBJECT, fileName)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          // ClipData를 사용하여 URI 권한을 더 명확하게 부여
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            clipData = ClipData.newUri(context.contentResolver, fileName, uri)
          }
        }
        
        // Chooser 생성 (작은 공유창 → 더보기 → 큰 공유창)
        val chooserIntent = Intent.createChooser(shareIntent, fileName)
        chooserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        chooserIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        // Chooser Intent에도 ClipData 추가
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
          chooserIntent.clipData = ClipData.newUri(context.contentResolver, fileName, uri)
        }
        
        // Activity 가져오기
        val activity = appContext.activityProvider?.currentActivity
        if (activity != null) {
          activity.startActivity(chooserIntent)
          Log.d("MediaStoreModule", "Share intent started successfully via Activity")
        } else {
          // Activity가 없으면 Context에서 시작 (FLAG_ACTIVITY_NEW_TASK 필요)
          context.startActivity(chooserIntent)
          Log.d("MediaStoreModule", "Share intent started successfully via Context")
        }
        
        promise.resolve(true)
      } catch (e: Exception) {
        Log.e("MediaStoreModule", "Error sharing content URI", e)
        promise.reject("SHARE_ERROR", "Failed to share file: ${e.message}", e)
      }
    }

    AsyncFunction("openContentUri") { contentUri: String, mimeType: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: return@AsyncFunction promise.reject("CONTEXT_ERROR", "React context is null", null)
        
        Log.d("MediaStoreModule", "Opening content URI: $contentUri, mimeType: $mimeType")
        
        val uri = Uri.parse(contentUri)
        
        // Intent 생성 (외부 플레이어로 열기)
        val viewIntent = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(uri, mimeType)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          // ClipData를 사용하여 URI 권한을 더 명확하게 부여
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            clipData = ClipData.newUri(context.contentResolver, "media", uri)
          }
        }
        viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        
        // Activity 가져오기
        val activity = appContext.activityProvider?.currentActivity
        if (activity != null) {
          activity.startActivity(viewIntent)
          Log.d("MediaStoreModule", "View intent started successfully via Activity")
        } else {
          // Activity가 없으면 Context에서 시작 (FLAG_ACTIVITY_NEW_TASK 필요)
          context.startActivity(viewIntent)
          Log.d("MediaStoreModule", "View intent started successfully via Context")
        }
        
        promise.resolve(true)
      } catch (e: Exception) {
        Log.e("MediaStoreModule", "Error opening content URI", e)
        promise.reject("OPEN_ERROR", "Failed to open file: ${e.message}", e)
      }
    }
  }
}











