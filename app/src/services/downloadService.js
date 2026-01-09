import * as FileSystem from 'expo-file-system/legacy';
import { Platform, Alert, NativeModules } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { API_BASE_URL } from '../config/api';
import MediaStoreModule from '../modules/MediaStoreModule';

// 디버깅: 모든 네이티브 모듈 목록 출력
console.log('[DownloadService] All NativeModules keys:', Object.keys(NativeModules));
console.log('[DownloadService] MediaStoreModule available:', !!MediaStoreModule);
if (MediaStoreModule) {
  console.log('[DownloadService] MediaStoreModule methods:', Object.keys(MediaStoreModule));
} else {
  console.error('[DownloadService] ❌ MediaStoreModule is NOT available!');
  console.error('[DownloadService] This means the native module is not registered.');
  console.error('[DownloadService] Check if the module is properly built and linked.');
}

// 다운로드 디렉토리 경로
const DOWNLOAD_DIR = `${FileSystem.documentDirectory}downloads/`;

// 다운로드 디렉토리 생성
const ensureDownloadDir = async () => {
  const dirInfo = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
    console.log('[DownloadService] Download directory created');
  }
};

// YouTube 영상 정보 가져오기
export const getVideoInfo = async (videoUrl) => {
  try {
    console.log('[DownloadService] Getting video info for:', videoUrl);
    
    const response = await fetch(`${API_BASE_URL}/api/video-info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: videoUrl }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || '영상 정보를 가져오는 데 실패했습니다.');
    }
    
    const info = await response.json();
    return info;
  } catch (error) {
    console.error('[DownloadService] Error getting video info:', error);
    throw error;
  }
};

// 영상 다운로드
export const downloadVideo = async (videoUrl, videoTitle, onProgress) => {
  try {
    await ensureDownloadDir();
    
    console.log('[DownloadService] Starting video download:', videoUrl);
    
    const fileName = `${sanitizeFileName(videoTitle || 'video')}.mp4`;
    const fileUri = `${DOWNLOAD_DIR}${fileName}`;
    
    // 이미 다운로드된 파일이 있는지 확인 (내부 저장소만)
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (fileInfo.exists && fileInfo.size > 0) {
      console.log('[DownloadService] File already exists in internal storage, skipping download:', fileUri);
      console.log('[DownloadService] Existing file size:', (fileInfo.size / (1024 * 1024)).toFixed(2), 'MB');
      if (onProgress) {
        onProgress(1.0); // 100% 완료로 표시
      }
      return fileUri;
    }
    
    // 백엔드 서버에서 직접 다운로드
    const downloadUrl = `${API_BASE_URL}/api/download/video?url=${encodeURIComponent(videoUrl)}&quality=highestvideo`;
    
    console.log('[DownloadService] Downloading from:', downloadUrl);
    console.log('[DownloadService] Saving to:', fileUri);
    
    // FileSystem.createDownloadResumable 사용
    // YouTube 스트림은 Content-Length를 제공하지 않으므로 정확한 진행률 계산 불가
    let lastProgress = 0;
    let progressInterval = null;
    
    // 다운로드 시작 시 최소 진행률 표시
    if (onProgress) {
      onProgress(0.01); // 1%로 시작 표시
      lastProgress = 0.01;
      
      // 주기적으로 진행률 업데이트 (다운로드가 진행 중임을 표시)
      progressInterval = setInterval(() => {
        if (lastProgress < 0.9) {
          lastProgress = Math.min(0.9, lastProgress + 0.05); // 5%씩 증가 (최대 90%)
          onProgress(lastProgress);
        }
      }, 2000); // 2초마다 업데이트
    }
    
    const downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      fileUri,
      {},
      (downloadProgress) => {
        console.log('[DownloadService] Progress callback:', {
          written: downloadProgress.totalBytesWritten,
          expected: downloadProgress.totalBytesExpectedToWrite
        });
        
        // totalBytesExpectedToWrite가 0이면 진행률을 계산할 수 없음
        if (downloadProgress.totalBytesExpectedToWrite > 0) {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          if (onProgress) {
            onProgress(progress);
          }
          lastProgress = progress;
          
          // 정확한 진행률이 있으면 interval 정리
          if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
          }
        } else {
          // Content-Length가 없으면 다운로드된 바이트 수로 추정 진행률 계산
          const downloadedMB = downloadProgress.totalBytesWritten / (1024 * 1024);
          // 다운로드된 크기에 따라 추정 진행률 (대략적인 추정)
          // 평균 영상 크기를 100MB로 가정하고, 최대 99%까지 표시 (실제로는 알 수 없음)
          const estimatedProgress = Math.min(0.99, downloadedMB / 100);
          
          if (onProgress && estimatedProgress > lastProgress) {
            // interval 정리하고 실제 진행률 사용
            if (progressInterval) {
              clearInterval(progressInterval);
              progressInterval = null;
            }
            onProgress(estimatedProgress);
            lastProgress = estimatedProgress;
          }
          
          console.log('[DownloadService] Downloaded:', downloadedMB.toFixed(2), 'MB, estimated progress:', (estimatedProgress * 100).toFixed(1) + '%');
        }
      }
    );
    
    console.log('[DownloadService] Starting download...');
    // 타임아웃 설정 (10분)
    const downloadPromise = downloadResumable.downloadAsync();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('다운로드 타임아웃: 시간이 초과되었습니다.')), 10 * 60 * 1000);
    });
    const result = await Promise.race([downloadPromise, timeoutPromise]);
    
    // interval 정리
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    
    if (result && result.uri) {
      // 다운로드된 파일 확인
      const fileInfo = await FileSystem.getInfoAsync(result.uri);
      if (!fileInfo.exists) {
        throw new Error('다운로드된 파일을 찾을 수 없습니다.');
      }
      
      if (!fileInfo.size || fileInfo.size === 0) {
        throw new Error('다운로드된 파일의 크기가 0입니다. 다운로드를 다시 시도해주세요.');
      }
      
      console.log('[DownloadService] Video downloaded:', result.uri, 'Size:', (fileInfo.size / (1024 * 1024)).toFixed(2), 'MB');
      if (onProgress) {
        onProgress(1.0); // 완료
      }
      return result.uri;
    } else {
      throw new Error('다운로드가 완료되지 않았습니다.');
    }
  } catch (error) {
    console.error('[DownloadService] Error downloading video:', error);
    throw error;
  }
};

// 음악 다운로드 (오디오만)
export const downloadAudio = async (videoUrl, videoTitle, onProgress) => {
  try {
    await ensureDownloadDir();
    
    console.log('[DownloadService] Starting audio download:', videoUrl);
    
    const fileName = `${sanitizeFileName(videoTitle || 'audio')}.m4a`;
    const fileUri = `${DOWNLOAD_DIR}${fileName}`;
    
    // 이미 다운로드된 파일이 있는지 확인 (내부 저장소만)
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (fileInfo.exists && fileInfo.size > 0) {
      console.log('[DownloadService] File already exists, skipping download:', fileUri);
      console.log('[DownloadService] Existing file size:', (fileInfo.size / (1024 * 1024)).toFixed(2), 'MB');
      if (onProgress) {
        onProgress(1.0); // 100% 완료로 표시
      }
      return fileUri;
    }
    
    // 백엔드 서버에서 직접 다운로드
    const downloadUrl = `${API_BASE_URL}/api/download/audio?url=${encodeURIComponent(videoUrl)}&quality=highestaudio`;
    
    console.log('[DownloadService] Downloading from:', downloadUrl);
    console.log('[DownloadService] Saving to:', fileUri);
    
    // FileSystem.createDownloadResumable 사용
    let lastProgress = 0;
    let progressInterval = null;
    
    // 다운로드 시작 시 최소 진행률 표시
    if (onProgress) {
      onProgress(0.01); // 1%로 시작 표시
      lastProgress = 0.01;
      
      // 주기적으로 진행률 업데이트 (다운로드가 진행 중임을 표시)
      progressInterval = setInterval(() => {
        if (lastProgress < 0.9) {
          lastProgress = Math.min(0.9, lastProgress + 0.05); // 5%씩 증가 (최대 90%)
          onProgress(lastProgress);
        }
      }, 2000); // 2초마다 업데이트
    }
    
    const downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      fileUri,
      {},
      (downloadProgress) => {
        console.log('[DownloadService] Progress callback:', {
          written: downloadProgress.totalBytesWritten,
          expected: downloadProgress.totalBytesExpectedToWrite
        });
        
        // totalBytesExpectedToWrite가 0이면 진행률을 계산할 수 없음
        if (downloadProgress.totalBytesExpectedToWrite > 0) {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          if (onProgress) {
            onProgress(progress);
          }
          lastProgress = progress;
          
          // 정확한 진행률이 있으면 interval 정리
          if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
          }
        } else {
          // Content-Length가 없으면 다운로드된 바이트 수로 추정 진행률 계산
          const downloadedMB = downloadProgress.totalBytesWritten / (1024 * 1024);
          // 다운로드된 크기에 따라 추정 진행률 (대략적인 추정)
          // 평균 오디오 크기를 10MB로 가정하고, 최대 99%까지 표시 (실제로는 알 수 없음)
          const estimatedProgress = Math.min(0.99, downloadedMB / 10);
          
          if (onProgress && estimatedProgress > lastProgress) {
            // interval 정리하고 실제 진행률 사용
            if (progressInterval) {
              clearInterval(progressInterval);
              progressInterval = null;
            }
            onProgress(estimatedProgress);
            lastProgress = estimatedProgress;
          }
          
          console.log('[DownloadService] Downloaded:', downloadedMB.toFixed(2), 'MB, estimated progress:', (estimatedProgress * 100).toFixed(1) + '%');
        }
      }
    );
    
    console.log('[DownloadService] Starting download...');
    // 타임아웃 설정 (10분)
    const downloadPromise = downloadResumable.downloadAsync();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('다운로드 타임아웃: 시간이 초과되었습니다.')), 10 * 60 * 1000);
    });
    const result = await Promise.race([downloadPromise, timeoutPromise]);
    
    // interval 정리
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    
    if (result && result.uri) {
      // 다운로드된 파일 확인
      const fileInfo = await FileSystem.getInfoAsync(result.uri);
      if (!fileInfo.exists) {
        throw new Error('다운로드된 파일을 찾을 수 없습니다.');
      }
      
      if (!fileInfo.size || fileInfo.size === 0) {
        throw new Error('다운로드된 파일의 크기가 0입니다. 다운로드를 다시 시도해주세요.');
      }
      
      console.log('[DownloadService] Audio downloaded:', result.uri, 'Size:', (fileInfo.size / (1024 * 1024)).toFixed(2), 'MB');
      if (onProgress) {
        onProgress(1.0); // 완료
      }
      return result.uri;
    } else {
      throw new Error('다운로드가 완료되지 않았습니다.');
    }
  } catch (error) {
    console.error('[DownloadService] Error downloading audio:', error);
    throw error;
  }
};

// 파일명에서 특수문자 제거
export const sanitizeFileName = (fileName) => {
  return fileName
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100); // 파일명 길이 제한
};

// 다운로드한 파일을 기기 저장소에 저장 (갤러리/미디어 라이브러리)
// 카카오톡처럼 외부 저장소의 공개 디렉토리(Movies/Music)에 저장
export const saveFileToDevice = async (fileUri, fileName, isVideo = true) => {
  try {
    console.log('[DownloadService] Saving file to device:', fileUri, fileName, 'isVideo:', isVideo);
    
    // 파일이 실제로 존재하는지 확인
    console.log('[DownloadService] Checking file existence:', fileUri);
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    console.log('[DownloadService] File info:', {
      exists: fileInfo.exists,
      size: fileInfo.size,
      uri: fileInfo.uri,
      isDirectory: fileInfo.isDirectory
    });
    
    if (!fileInfo.exists) {
      console.error('[DownloadService] ❌ File does not exist!');
      console.error('[DownloadService] File URI:', fileUri);
      throw new Error(`다운로드된 파일을 찾을 수 없습니다: ${fileUri}\n\n다운로드를 다시 시도해주세요.`);
    }
    
    if (!fileInfo.size || fileInfo.size === 0) {
      console.error('[DownloadService] ❌ File size is 0!');
      throw new Error('다운로드된 파일의 크기가 0입니다. 다운로드를 다시 시도해주세요.');
    }
    
    console.log('[DownloadService] ✅ File exists, size:', (fileInfo.size / (1024 * 1024)).toFixed(2), 'MB');
    
    // 미디어 라이브러리 권한 요청
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('미디어 라이브러리 접근 권한이 필요합니다.');
    }
    
    // 파일 확장자 확인
    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    const isVideoFile = isVideo || fileExtension === 'mp4' || fileExtension === 'mov' || fileExtension === 'avi' || fileExtension === 'mkv';
    const isAudioFile = fileExtension === 'm4a' || fileExtension === 'mp3' || fileExtension === 'aac' || fileExtension === 'wav' || fileExtension === 'mpeg';
    
    console.log('[DownloadService] File type - isVideo:', isVideoFile, 'isAudio:', isAudioFile, 'extension:', fileExtension);
    
    // Android에서는 expo-media-library의 createAssetAsync가 파일을 외부 저장소의 공개 디렉토리로
    // 자동으로 복사한 후 저장합니다. (카카오톡과 동일한 방식)
    // 하지만 내부 저장소에서 시작하면 MIME 타입 감지 문제가 발생할 수 있으므로,
    // 파일을 먼저 외부 저장소로 복사한 후 저장합니다.
    
    let asset;
    
    if (Platform.OS === 'android') {
      // Android: 파일은 이미 내부 저장소에 다운로드되어 있습니다.
      // 이제 이 파일을 외부 저장소의 공개 디렉토리(Movies/Music)로 복사해야 합니다.
      // expo-media-library의 createAssetAsync가 이를 자동으로 처리하지만,
      // 내부 저장소 파일의 MIME 타입을 제대로 감지하지 못하는 문제가 있습니다.
      
      console.log('[DownloadService] File is already on device (internal storage)');
      console.log('[DownloadService] Source file URI:', fileUri);
      console.log('[DownloadService] File extension:', fileExtension);
      console.log('[DownloadService] Is video:', isVideoFile, 'Is audio:', isAudioFile);
      console.log('[DownloadService] Using native MediaStore module to save to external storage...');
      
      // 네이티브 모듈 사용 시도
      console.log('[DownloadService] ========== MediaStoreModule Check ==========');
      console.log('[DownloadService] MediaStoreModule exists:', !!MediaStoreModule);
      console.log('[DownloadService] MediaStoreModule value:', MediaStoreModule);
      console.log('[DownloadService] All NativeModules:', Object.keys(NativeModules));
      if (MediaStoreModule) {
        console.log('[DownloadService] MediaStoreModule keys:', Object.keys(MediaStoreModule));
        console.log('[DownloadService] has saveToMediaStore:', typeof MediaStoreModule.saveToMediaStore);
      }
      console.log('[DownloadService] ===========================================');
      
      if (MediaStoreModule && typeof MediaStoreModule.saveToMediaStore === 'function') {
        try {
          console.log('[DownloadService] ========== Calling native MediaStoreModule.saveToMediaStore ==========');
          
          // 파일 URI 정규화 (file:// 프로토콜 제거, URL 인코딩 디코딩)
          let normalizedFileUri = fileUri;
          if (normalizedFileUri.startsWith('file://')) {
            normalizedFileUri = normalizedFileUri.replace('file://', '');
          }
          // URL 인코딩된 문자 디코딩
          try {
            normalizedFileUri = decodeURIComponent(normalizedFileUri);
          } catch (e) {
            console.warn('[DownloadService] Could not decode URI, using original:', e);
          }
          
          // 파일명 디코딩 (URL 인코딩된 경우)
          const decodedFileName = decodeURIComponent(fileName);
          
          // 파일이 여전히 존재하는지 다시 확인
          const finalFileInfo = await FileSystem.getInfoAsync(fileUri);
          if (!finalFileInfo.exists) {
            throw new Error(`파일이 존재하지 않습니다: ${fileUri}`);
          }
          
          console.log('[DownloadService] Normalized file URI:', normalizedFileUri);
          console.log('[DownloadService] Original file URI:', fileUri);
          console.log('[DownloadService] Parameters:', { fileUri: normalizedFileUri, fileName: decodedFileName, isVideoFile });
          console.log('[DownloadService] File exists, size:', finalFileInfo.size, 'bytes');
          
          const mediaUri = await MediaStoreModule.saveToMediaStore(normalizedFileUri, decodedFileName, isVideoFile);
          
          console.log('[DownloadService] Native module returned:', mediaUri);
          console.log('[DownloadService] ✅ File saved successfully using native module!');
          console.log('[DownloadService] Media URI:', mediaUri);
          
          // MediaLibrary에서 asset 정보 가져오기 (앨범 추가를 위해)
          // 주의: getAssetInfoAsync는 실패할 수 있으므로, 실패해도 파일은 이미 저장되었으므로 계속 진행
          try {
            asset = await MediaLibrary.getAssetInfoAsync(mediaUri);
            console.log('[DownloadService] Asset info retrieved:', asset.uri, 'mediaType:', asset.mediaType);
          } catch (assetError) {
            console.warn('[DownloadService] Could not get asset info, but file is saved:', assetError);
            // asset 정보를 가져오지 못해도 파일은 저장되었으므로 계속 진행
            // mediaUri를 직접 사용하여 asset 객체 생성
            asset = { uri: mediaUri, mediaType: isVideoFile ? 'video' : 'audio' };
            console.log('[DownloadService] Using mediaUri directly as asset:', asset);
          }
        } catch (nativeError) {
          console.error('[DownloadService] ❌ Native module failed:', nativeError);
          console.error('[DownloadService] Native error message:', nativeError.message);
          console.error('[DownloadService] Native error stack:', nativeError.stack);
          console.error('[DownloadService] Native error code:', nativeError.code);
          console.error('[DownloadService] Native error details:', JSON.stringify(nativeError, null, 2));
          
          // 네이티브 모듈 실패 시 오류 메시지만 표시 (공유하기는 별도 버튼에서만 사용)
          const errorMessage = nativeError.message || nativeError.code || '알 수 없는 오류';
          throw new Error(`자동 저장에 실패했습니다: ${errorMessage}\n\n공유하기 버튼을 사용하여 수동으로 저장해주세요.`);
        }
      } else {
        // 네이티브 모듈이 없는 경우 - 빌드 문제일 수 있음
        console.error('[DownloadService] ❌❌❌ MediaStoreModule is NOT available!');
        console.error('[DownloadService] MediaStoreModule value:', MediaStoreModule);
        console.error('[DownloadService] This means the native module is not registered.');
        console.error('[DownloadService] Please rebuild the app with: npx expo run:android');
        
        // 네이티브 모듈이 없으면 오류 메시지만 표시 (공유하기는 별도 버튼에서만 사용)
        throw new Error('저장 기능을 사용할 수 없습니다.\n\n네이티브 저장 모듈이 등록되지 않았습니다. 앱을 재빌드해주세요.\n\n또는 공유하기 버튼을 사용하여 수동으로 저장해주세요.');
      }
    } else {
      // iOS: 원본 URI로 저장
      asset = await MediaLibrary.createAssetAsync(fileUri);
      console.log('[DownloadService] File saved to media library:', asset.uri, 'mediaType:', asset.mediaType);
    }
    
    // 앨범에 추가 (선택사항)
    try {
      const albumName = isVideo ? 'YouTube Videos' : 'YouTube Audio';
      let album = await MediaLibrary.getAlbumAsync(albumName);
      if (!album) {
        album = await MediaLibrary.createAlbumAsync(albumName, asset, false);
      } else {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      }
      console.log('[DownloadService] File added to album:', albumName);
    } catch (albumError) {
      console.warn('[DownloadService] Could not add to album:', albumError);
      // 앨범 추가 실패해도 파일은 저장되었으므로 계속 진행
    }
    
    // 저장 성공 후 앱 내부 저장소의 원본 파일은 유지
    // 외부 저장소에 파일이 있어도 다시 다운로드할 때 내부 저장소 파일을 사용할 수 있도록
    // (외부 저장소 확인이 실패할 수 있으므로 내부 저장소 파일을 백업으로 유지)
    console.log('[DownloadService] Keeping internal storage file as backup:', fileUri);
    
    return asset.uri;
  } catch (error) {
    console.error('[DownloadService] Error saving file to device:', error);
    throw error;
  }
};

// 다운로드한 파일 공유
export const shareDownloadedFile = async (fileUri, fileName, isVideo = true) => {
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      // 파일 확장자로 MIME 타입 결정
      const fileExtension = fileName?.split('.').pop()?.toLowerCase();
      let mimeType = 'application/octet-stream';
      
      if (isVideo || fileExtension === 'mp4' || fileExtension === 'mov' || fileExtension === 'avi') {
        mimeType = fileExtension === 'mp4' ? 'video/mp4' : 
                   fileExtension === 'mov' ? 'video/quicktime' : 
                   fileExtension === 'avi' ? 'video/x-msvideo' : 'video/mp4';
      } else if (fileExtension === 'm4a' || fileExtension === 'mp3' || fileExtension === 'aac' || fileExtension === 'wav') {
        mimeType = fileExtension === 'm4a' ? 'audio/mp4' : 
                   fileExtension === 'mp3' ? 'audio/mpeg' : 
                   fileExtension === 'aac' ? 'audio/aac' : 
                   fileExtension === 'wav' ? 'audio/wav' : 'audio/mpeg';
      }
      
      console.log('[DownloadService] Sharing file with MIME type:', mimeType, 'fileName:', fileName);
      console.log('[DownloadService] Source file URI:', fileUri);
      
      // Android에서 "내 폰에 저장" 옵션이 나타나도록 하려면
      // 파일을 먼저 expo-media-library로 외부 저장소에 저장한 후 공유해야 합니다
      // 하지만 사용자가 공유를 원하는 경우, 직접 공유하는 것이 더 빠를 수 있습니다
      
      // Android에서 내부 저장소 파일을 공유할 때 "내 폰에 저장" 옵션이 나타나지 않을 수 있습니다
      // 이 경우 파일을 외부 저장소로 먼저 복사한 후 공유하거나,
      // 사용자가 "저장하기" 버튼을 사용하도록 안내해야 합니다
      
      // MIME 타입을 명시적으로 지정하여 공유
      // Android에서 갤러리 앱과 "내 폰에 저장" 옵션이 공유 목록에 나타나도록 함
      await Sharing.shareAsync(fileUri, {
        mimeType: mimeType,
        dialogTitle: '파일 저장',
        UTI: Platform.OS === 'ios' ? (isVideo ? 'public.movie' : 'public.audio') : undefined,
      });
    } else {
      Alert.alert('알림', '파일 공유 기능을 사용할 수 없습니다.');
    }
  } catch (error) {
    console.error('[DownloadService] Error sharing file:', error);
    Alert.alert('오류', '파일 공유 중 오류가 발생했습니다.');
  }
};

// 파일 정보 확인
// 다운로드한 파일 목록 가져오기
export const getDownloadedFiles = async () => {
  try {
    await ensureDownloadDir();
    const dirInfo = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
    
    if (!dirInfo.exists) {
      return [];
    }
    
    // 디렉토리 내용 읽기
    const files = await FileSystem.readDirectoryAsync(DOWNLOAD_DIR);
    
    const fileList = [];
    for (const fileName of files) {
      const fileUri = `${DOWNLOAD_DIR}${fileName}`;
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      
      if (fileInfo.exists && !fileInfo.isDirectory && fileInfo.size > 0) {
        // 파일명에서 제목 추출 (확장자 제거)
        const title = fileName.replace(/\.(mp4|m4a|mp3)$/i, '');
        const isVideo = fileName.toLowerCase().endsWith('.mp4');
        
        fileList.push({
          fileName,
          fileUri,
          title,
          size: fileInfo.size,
          isVideo,
          modifiedTime: fileInfo.modificationTime || Date.now(),
        });
      }
    }
    
    // 최신순으로 정렬
    fileList.sort((a, b) => b.modifiedTime - a.modifiedTime);
    
    return fileList;
  } catch (error) {
    console.error('[DownloadService] Error getting downloaded files:', error);
    return [];
  }
};

export const getFileInfo = async (fileUri) => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (fileInfo.exists) {
      const fileSizeMB = fileInfo.size ? (fileInfo.size / (1024 * 1024)).toFixed(2) : '알 수 없음';
      console.log('[DownloadService] File info:', {
        uri: fileUri,
        exists: fileInfo.exists,
        size: fileSizeMB + ' MB'
      });
    }
    return fileInfo;
  } catch (error) {
    console.error('[DownloadService] Error getting file info:', error);
    return null;
  }
};

