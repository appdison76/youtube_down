import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import MediaStoreModule from '../modules/MediaStoreModule';
import { getApiBaseUrl, getApiBaseUrls, fetchWithFallback } from '../config/api';

const DOWNLOAD_DIR = `${FileSystem.documentDirectory}downloads/`;
const METADATA_DIR = `${FileSystem.documentDirectory}metadata/`;
const THUMBNAIL_CACHE_DIR = `${FileSystem.documentDirectory}thumbnails/`;

// HTML 엔티티 디코딩 함수
const decodeHtmlEntities = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  // HTML 엔티티를 일반 문자로 변환
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
};

// 디렉토리 초기화
const ensureDirectories = async () => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
    }
    
    const metadataInfo = await FileSystem.getInfoAsync(METADATA_DIR);
    if (!metadataInfo.exists) {
      await FileSystem.makeDirectoryAsync(METADATA_DIR, { intermediates: true });
    }
    
    const thumbnailInfo = await FileSystem.getInfoAsync(THUMBNAIL_CACHE_DIR);
    if (!thumbnailInfo.exists) {
      await FileSystem.makeDirectoryAsync(THUMBNAIL_CACHE_DIR, { intermediates: true });
    }
    } catch (error) {
    console.error('[downloadService] Error ensuring directories:', error);
  }
};

// 썸네일 캐시 디렉토리 생성
const ensureThumbnailCacheDir = async () => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(THUMBNAIL_CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(THUMBNAIL_CACHE_DIR, { intermediates: true });
      console.log('[downloadService] Thumbnail cache directory created');
        }
    } catch (error) {
    console.error('[downloadService] Error ensuring thumbnail cache directory:', error);
  }
};

// 파일명 정리 (특수문자 제거)
export const sanitizeFileName = (fileName, maxLength = 200) => {
  if (!fileName) return 'file';
  
  // 특수문자 제거 및 공백을 언더스코어로 변경
  let sanitized = fileName
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .trim();
  
  // 최대 길이 제한
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized;
};

// 파일 정보 가져오기
export const getFileInfo = async (fileUri) => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (fileInfo.exists) {
      return {
        exists: true,
        size: fileInfo.size || 0,
        uri: fileUri,
      };
    }
    return { exists: false, size: 0, uri: fileUri };
      } catch (error) {
    console.error('[downloadService] Error getting file info:', error);
    return { exists: false, size: 0, uri: fileUri };
  }
};

// 다운로드된 파일 목록 가져오기
export const getDownloadedFiles = async () => {
  try {
    await ensureDirectories();
    
    const files = [];
    const dirInfo = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
    
    if (!dirInfo.exists) {
      return [];
    }
    
    const fileList = await FileSystem.readDirectoryAsync(DOWNLOAD_DIR);
    
    for (const fileName of fileList) {
      const fileUri = `${DOWNLOAD_DIR}${fileName}`;
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      
      if (fileInfo.exists && fileInfo.size > 0) {
        const isVideo = fileName.endsWith('.mp4');
        const isAudio = fileName.endsWith('.m4a') || fileName.endsWith('.mp3');
        
        if (isVideo || isAudio) {
          // 메타데이터 파일 읽기 (확장자 포함: {videoId}.mp4.json 또는 {videoId}.m4a.json)
          const metadataFileName = `${fileName}.json`;
          const metadataUri = `${METADATA_DIR}${metadataFileName}`;
          let metadata = {};
          
          try {
            const metadataInfo = await FileSystem.getInfoAsync(metadataUri);
            if (metadataInfo.exists) {
              const metadataContent = await FileSystem.readAsStringAsync(metadataUri);
              metadata = JSON.parse(metadataContent);
            }
    } catch (error) {
            console.warn('[downloadService] Error reading metadata:', error);
          }
          
          // 메타데이터가 있는 파일만 표시 (다운로드 완료된 파일만)
          // 메타데이터가 없으면 건너뛰기 (다운로드 중인 파일은 메타데이터가 있어야 함)
          if (!metadata || Object.keys(metadata).length === 0) {
            continue;
          }
          
          // 파일명: 메타데이터의 displayFileName 우선, 없으면 내부 파일명 사용
          const displayFileName = metadata.displayFileName || fileName;
          
          // 파일명에서 제목 추출 (확장자 제거)
          const title = metadata.title || (displayFileName.includes('.') 
            ? displayFileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ')
            : displayFileName.replace(/_/g, ' '));
          
          // 날짜 정보: 메타데이터의 downloadedAtTimestamp 우선, 없으면 downloadedAt, 없으면 파일 수정 시간 사용
          let fileDate = null;
          
          // downloadedAtTimestamp가 있으면 우선 사용 (가장 정확)
          if (metadata.downloadedAtTimestamp && typeof metadata.downloadedAtTimestamp === 'number') {
            fileDate = metadata.downloadedAtTimestamp;
          } else if (metadata.downloadedAt) {
            // ISO 문자열을 숫자로 변환
            const dateObj = new Date(metadata.downloadedAt);
            fileDate = isNaN(dateObj.getTime()) ? null : dateObj.getTime();
            if (!fileDate) {
              console.warn('[downloadService] Invalid downloadedAt date:', metadata.downloadedAt, 'for file:', fileName);
            }
          }
          
          // downloadedAt이 없거나 유효하지 않으면 파일 수정 시간 사용
          if (!fileDate && fileInfo.modificationTime) {
            fileDate = fileInfo.modificationTime * 1000; // 초를 밀리초로 변환
          }
          
          // 둘 다 없으면 현재 시간 사용 (최신으로 표시)
          if (!fileDate) {
            fileDate = Date.now();
            console.warn('[downloadService] No date info for file, using current time:', fileName);
          }
          
          files.push({
            fileUri,
            fileName: displayFileName, // 외부 저장소용 원래 파일명 사용 (사용자에게 보여줄 파일명)
            title,
            size: fileInfo.size,
            isVideo,
            videoId: metadata.videoId || null,
            thumbnail: metadata.thumbnail || null,
            downloadedAt: fileDate, // 정렬을 위한 날짜 필드 추가
            status: metadata.status || null, // 다운로드 상태 (downloading, completed, error)
          });
        }
      }
    }
    
    // 최신순으로 정렬 (downloadedAt 기준, 없으면 파일명 기준)
    files.sort((a, b) => {
      if (a.downloadedAt && b.downloadedAt) {
        // downloadedAt이 있으면 숫자 비교 (최신순: 큰 값이 먼저)
        return b.downloadedAt - a.downloadedAt;
      } else if (a.downloadedAt) {
        return -1; // a가 downloadedAt이 있으면 먼저
      } else if (b.downloadedAt) {
        return 1; // b가 downloadedAt이 있으면 먼저
      } else {
        // 둘 다 없으면 파일명으로 정렬 (최신순)
        const aTime = a.fileName ? a.fileName : '';
        const bTime = b.fileName ? b.fileName : '';
        return bTime.localeCompare(aTime);
      }
    });
    
    return files;
  } catch (error) {
    console.error('[downloadService] Error getting downloaded files:', error);
    return [];
  }
};

// 불완전한 파일 정리
export const cleanupIncompleteFiles = async () => {
  try {
    await ensureDirectories();
    
    const dirInfo = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
    if (!dirInfo.exists) {
      return;
    }
    
    const fileList = await FileSystem.readDirectoryAsync(DOWNLOAD_DIR);
    
    for (const fileName of fileList) {
      const fileUri = `${DOWNLOAD_DIR}${fileName}`;
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      
      // 파일이 없거나 크기가 0이면 삭제
      if (!fileInfo.exists || fileInfo.size === 0) {
        try {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
          console.log('[downloadService] Cleaned up incomplete file:', fileName);
        } catch (error) {
          console.warn('[downloadService] Error deleting incomplete file:', error);
          }
        }
      }
    } catch (error) {
    console.error('[downloadService] Error cleaning up incomplete files:', error);
  }
};

// 비디오 정보 가져오기 (oEmbed API 사용)
export const getVideoInfo = async (url) => {
  try {
    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(oEmbedUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // URL에서 비디오 ID 추출
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s?]+)/);
    const videoId = videoIdMatch ? videoIdMatch[1].split('?')[0].split('&')[0] : null;
    
    return {
          id: videoId,
      title: data.title || 'Video',
      url: url,
      thumbnail: data.thumbnail_url || (videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : ''),
          author: data.author_name || '',
          authorUrl: data.author_url || '',
    };
  } catch (error) {
    console.error('[downloadService] Error getting video info:', error);
    throw error;
  }
};

// 파일 공유
export const shareDownloadedFile = async (fileUri, fileName, isVideo, videoId = null) => {
  try {
    // videoId가 있으면 외부 저장소에서 파일 찾기 시도
    if (videoId && Platform.OS === 'android' && MediaStoreModule && typeof MediaStoreModule.getContentUriByVideoId === 'function') {
      try {
        const externalContentUri = await MediaStoreModule.getContentUriByVideoId(videoId, isVideo);
        console.log('[downloadService] ✅ Found file in external storage, using it for sharing:', externalContentUri);
        
        // 외부 저장소 파일을 사용하여 공유
        const mimeType = isVideo ? 'video/mp4' : 'audio/mp4';
        await MediaStoreModule.shareContentUri(externalContentUri, mimeType, fileName);
        return;
      } catch (error) {
        console.warn('[downloadService] ⚠️ Could not find file in external storage by videoId, falling back to internal file:', error.message);
        // 외부 저장소에서 찾지 못하면 내부 저장소 파일 사용
      }
    }
    
    // 내부 저장소 파일을 content:// URI로 변환하여 공유
    if (Platform.OS === 'android' && MediaStoreModule && typeof MediaStoreModule.getContentUri === 'function') {
      try {
        const contentUri = await MediaStoreModule.getContentUri(fileUri);
        const mimeType = isVideo ? 'video/mp4' : 'audio/mp4';
        await MediaStoreModule.shareContentUri(contentUri, mimeType, fileName);
        return;
      } catch (error) {
        console.warn('[downloadService] Failed to convert to content:// URI, falling back to ExpoSharing:', error.message);
      }
    }
    
    // ExpoSharing은 file:// URI만 지원하므로 content:// URI는 사용하지 않음
    // fileUri가 이미 file://로 시작하는지 확인
    let shareUri = fileUri;
    
    // content:// URI인 경우 원본 file:// URI를 찾거나 그대로 사용
    if (fileUri.startsWith('content://')) {
      console.warn('[downloadService] content:// URI detected, but ExpoSharing only supports file:// URIs');
      // content:// URI는 ExpoSharing에서 지원하지 않으므로 오류 발생
      throw new Error('content:// URI는 공유할 수 없습니다. 파일 경로를 사용해주세요.');
    }
    
    // file:// URI가 아니면 file:// 추가 시도
    if (!fileUri.startsWith('file://')) {
      // 상대 경로인 경우 절대 경로로 변환
      if (fileUri.startsWith('/')) {
        shareUri = `file://${fileUri}`;
    } else {
        shareUri = `file://${DOWNLOAD_DIR}${fileUri}`;
      }
    }
    
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('공유 기능을 사용할 수 없습니다.');
    }
    
    await Sharing.shareAsync(shareUri, {
      mimeType: isVideo ? 'video/mp4' : 'audio/mp4',
      dialogTitle: fileName,
    });
    } catch (error) {
    console.error('[downloadService] Error sharing file:', error);
    throw error;
  }
};

// 파일을 기기 저장소에 저장
export const saveFileToDevice = async (fileUri, fileName, isVideo, videoId = null) => {
  try {
    if (Platform.OS !== 'android') {
      throw new Error('파일 저장은 Android에서만 지원됩니다.');
    }
    
    if (!MediaStoreModule) {
      console.warn('[downloadService] MediaStoreModule is not available');
      throw new Error('MediaStoreModule을 사용할 수 없습니다. 앱을 다시 빌드해주세요.');
    }
    
    // MediaStoreModule의 메서드 확인
    const availableMethods = Object.keys(MediaStoreModule || {});
    console.log('[downloadService] MediaStoreModule available methods:', availableMethods);
    
    // 메서드 이름 확인: saveToMediaStore (Kotlin에서 정의된 이름)
    if (typeof MediaStoreModule.saveToMediaStore !== 'function') {
      console.error('[downloadService] saveToMediaStore method not found. Available methods:', availableMethods);
      throw new Error('MediaStoreModule.saveToMediaStore 메서드를 사용할 수 없습니다. 앱을 다시 빌드해주세요.');
    }
    
    // fileUri 정규화: 여러 형식으로 시도
    let normalizedUri = fileUri;
    let fileInfo = null;
    
    console.log('[downloadService] Checking file existence. Original URI:', fileUri);
    
    // 여러 형식으로 시도 (file:// 포함/미포함, 절대 경로 등)
    const pathsToTry = [];
    
    // 원본 그대로
    pathsToTry.push(fileUri);
    
    // file:// 추가/제거
    if (fileUri.startsWith('file://')) {
      pathsToTry.push(fileUri.replace('file://', ''));
      } else {
      pathsToTry.push(`file://${fileUri}`);
    }
    
    // 절대 경로인 경우 file:// 추가
    if (fileUri.startsWith('/') && !fileUri.startsWith('file://')) {
      pathsToTry.push(`file://${fileUri}`);
    }
    
    // 상대 경로인 경우 DOWNLOAD_DIR 추가
    if (!fileUri.startsWith('/') && !fileUri.startsWith('file://')) {
      pathsToTry.push(`${DOWNLOAD_DIR}${fileUri}`);
      pathsToTry.push(`file://${DOWNLOAD_DIR}${fileUri}`);
    }
    
    // 중복 제거
    const uniquePaths = [...new Set(pathsToTry)];
    
    console.log('[downloadService] Trying paths:', uniquePaths);
    
    for (const path of uniquePaths) {
      try {
        fileInfo = await FileSystem.getInfoAsync(path);
        if (fileInfo && fileInfo.exists) {
          normalizedUri = path;
          console.log('[downloadService] File found at:', normalizedUri);
        break;
        }
      } catch (error) {
        console.log('[downloadService] Failed to check path:', path, error.message);
      }
    }
    
    if (!fileInfo || !fileInfo.exists) {
      console.error('[downloadService] File does not exist in any of the tried paths:', uniquePaths);
      console.error('[downloadService] Original fileUri:', fileUri);
      throw new Error(`파일이 존재하지 않습니다: ${fileUri}`);
    }
    
    console.log('[downloadService] File exists, size:', fileInfo.size, 'bytes');
    
    // Android: MediaStore를 통해 저장
    // Kotlin에서 file:// 처리하므로 정규화된 URI 전달
    // file://가 없으면 추가
    let finalUri = normalizedUri;
    if (!finalUri.startsWith('file://') && finalUri.startsWith('/')) {
      finalUri = `file://${finalUri}`;
    }
    
    await MediaStoreModule.saveToMediaStore(finalUri, fileName, isVideo, videoId);
    } catch (error) {
    console.error('[downloadService] Error saving file to device:', error);
    throw error;
  }
};

// 비디오 다운로드
export const downloadVideo = async (videoUrl, videoTitle, onProgress, retryCount = 0, videoId = null, thumbnailUrl = null, shouldResume = false) => {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000;
  let currentFileUri = null;
  let progressInterval = null;
  let lastProgress = 0;
  let maxDownloadedSize = 0;
  let expectedSize = null;
  
  try {
    await ensureDirectories();
    
    console.log('[downloadService] Starting video download:', videoUrl, `(attempt ${retryCount + 1}/${MAX_RETRIES + 1})`, shouldResume ? '(resuming)' : '(new download)');
    console.log('[downloadService] Original video title:', videoTitle);
    
    // 내부 저장소: videoId로 저장 (짧고 안전한 파일명)
    const internalFileName = videoId 
      ? `${videoId}.mp4`  // videoId가 있으면 videoId 사용
      : `${sanitizeFileName(videoTitle || 'video', 195)}.mp4`; // 없으면 제목 사용
    const fileUri = `${DOWNLOAD_DIR}${internalFileName}`;
    currentFileUri = fileUri;
    
    // 외부 저장소용 원래 파일명 (사용자에게 보여줄 파일명)
    const displayFileName = `${sanitizeFileName(videoTitle || 'video', 195)}.mp4`;
    
    console.log('[downloadService] Internal file name:', internalFileName);
    console.log('[downloadService] Display file name:', displayFileName);
    console.log('[downloadService] File URI:', fileUri);
    
    // 이어받기가 아닌 경우에만 기존 파일 삭제
    if (!shouldResume) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (fileInfo.exists) {
          console.log('[downloadService] Existing file found, deleting before re-download:', fileUri);
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
          console.log('[downloadService] Existing file deleted successfully');
        }
      } catch (deleteError) {
        console.warn('[downloadService] Could not delete existing file (may not exist):', deleteError);
      }
    } else {
      console.log('[downloadService] Resuming download, keeping existing file:', fileUri);
    }
    
    // 다운로드 시작 시 메타데이터에 status: "downloading" 저장
    try {
      const downloadTimestamp = Date.now();
      const metadata = {
        title: videoTitle,
        videoId,
        displayFileName,
        thumbnail: thumbnailUrl,
        downloadUrl: videoUrl, // 이어받기 시 필요
        status: 'downloading',
        downloadedAt: new Date(downloadTimestamp).toISOString(),
        downloadedAtTimestamp: downloadTimestamp,
      };
      const metadataFileName = `${internalFileName}.json`;
      const metadataUri = `${METADATA_DIR}${metadataFileName}`;
      await FileSystem.writeAsStringAsync(metadataUri, JSON.stringify(metadata));
      console.log('[downloadService] Metadata saved with status: downloading');
    } catch (metadataError) {
      console.warn('[downloadService] Error saving initial metadata (non-critical):', metadataError);
    }
    
    // 예상 파일 크기 가져오기 (참고용)
    try {
      const videoInfo = await getVideoInfo(videoUrl);
      expectedSize = videoInfo.filesize || null;
      if (expectedSize) {
        console.log('[downloadService] Expected file size:', expectedSize, 'bytes (', (expectedSize / (1024 * 1024)).toFixed(2), 'MB)');
      }
    } catch (error) {
      console.log('[downloadService] Could not get expected file size, proceeding without it:', error.message || error);
      expectedSize = null;
    }
    
    // 이중화: URL 목록 순서대로 시도 (primary 실패 시 Railway 등)
    const baseUrls = await getApiBaseUrls();
    let lastDownloadError = null;
    for (let urlIndex = 0; urlIndex < baseUrls.length; urlIndex++) {
      const apiBaseUrl = baseUrls[urlIndex];
      console.log('[downloadService] Using API base URL for video download (#', urlIndex + 1, '/', baseUrls.length, '):', apiBaseUrl);
      try {
    const downloadUrl = `${apiBaseUrl.replace(/\/$/, '')}/api/download/video?url=${encodeURIComponent(videoUrl)}&quality=highestvideo`;
    
    console.log('[downloadService] Downloading from:', downloadUrl);
    console.log('[downloadService] Saving to:', fileUri);
    
    // 백엔드 응답 사전 확인 (HEAD 요청으로 Content-Length 확인)
    try {
      const headResponse = await fetch(downloadUrl, { method: 'HEAD' });
      const contentLength = headResponse.headers.get('content-length');
      const contentType = headResponse.headers.get('content-type');
      
      console.log('[downloadService] Pre-check - Status:', headResponse.status);
      console.log('[downloadService] Pre-check - Content-Type:', contentType);
      console.log('[downloadService] Pre-check - Content-Length:', contentLength);
      
      if (headResponse.status !== 200) {
        const errorText = await headResponse.text().catch(() => '');
        throw new Error(`백엔드 서버가 에러를 반환했습니다 (${headResponse.status}): ${errorText || headResponse.statusText}`);
      }
      
      if (contentLength && parseInt(contentLength) === 0) {
        throw new Error('백엔드 서버가 0 바이트 파일을 반환합니다. 해당 영상을 다운로드할 수 없을 수 있습니다.');
      }
      
      if (!contentType || !contentType.includes('video')) {
        // JSON 에러 응답일 수 있음
        const testResponse = await fetch(downloadUrl);
        const testContentType = testResponse.headers.get('content-type') || '';
        if (testContentType.includes('application/json')) {
          const errorData = await testResponse.json().catch(() => ({}));
          throw new Error(errorData.error || errorData.message || '백엔드 서버에서 에러를 반환했습니다.');
        }
      }
    } catch (preCheckError) {
      // 이중화 시 첫 URL 실패는 예상 가능 → warn으로만 (에러 오버레이 방지)
      console.warn('[downloadService] Pre-check failed:', preCheckError?.message || preCheckError);
      if (preCheckError.message && preCheckError.message.includes('백엔드')) {
        throw preCheckError;
      }
    }
    
    lastProgress = 0;
    maxDownloadedSize = 0;
    
    // 다운로드 시작 시 최소 진행률 표시
    if (onProgress) {
      onProgress(0.01);
      lastProgress = 0.01;
      
      // 폴백으로 진행률 업데이트 (다운로드가 진행률 정보를 제공하지 않는 경우)
      progressInterval = setInterval(() => {
        if (lastProgress < 0.9) {
          lastProgress = Math.min(0.9, lastProgress + 0.05);
          onProgress(lastProgress);
        }
      }, 2000);
    }
    
    const downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      fileUri,
      {},
      (downloadProgress) => {
        console.log('[downloadService] Progress callback:', {
          written: downloadProgress.totalBytesWritten,
          expected: downloadProgress.totalBytesExpectedToWrite
        });
        
        if (downloadProgress.totalBytesWritten > maxDownloadedSize) {
          maxDownloadedSize = downloadProgress.totalBytesWritten;
          console.log('[downloadService] Max downloaded size updated:', maxDownloadedSize, 'bytes (', (maxDownloadedSize / (1024 * 1024)).toFixed(2), 'MB)');
        }
        
        if (downloadProgress.totalBytesExpectedToWrite > 0) {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          if (onProgress) {
            onProgress(progress);
          }
          lastProgress = progress;
          
          if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
          }
      } else {
          // Content-Length가 없으면 다운로드된 바이트로 추정 진행률 계산
          const downloadedMB = downloadProgress.totalBytesWritten / (1024 * 1024);
          let estimatedProgress;
          
          if (downloadedMB < 10) {
            estimatedProgress = downloadedMB / 10 * 0.1;
          } else if (downloadedMB < 50) {
            estimatedProgress = 0.1 + (downloadedMB - 10) / 40 * 0.4;
          } else if (downloadedMB < 100) {
            estimatedProgress = 0.5 + (downloadedMB - 50) / 50 * 0.3;
          } else if (downloadedMB < 200) {
            estimatedProgress = 0.8 + (downloadedMB - 100) / 100 * 0.15;
          } else {
            estimatedProgress = Math.min(0.99, 0.95 + (downloadedMB - 200) / 500 * 0.04);
          }
          
          if (onProgress && downloadedMB > 0) {
            if (progressInterval) {
              clearInterval(progressInterval);
              progressInterval = null;
            }
            
            if (estimatedProgress > lastProgress) {
              onProgress(estimatedProgress);
              lastProgress = estimatedProgress;
            } else if (downloadedMB > 0 && lastProgress < 0.99) {
              const minProgress = Math.min(0.99, lastProgress + 0.001);
              onProgress(minProgress);
              lastProgress = minProgress;
            }
          }
          
          console.log('[downloadService] Downloaded:', downloadedMB.toFixed(2), 'MB, estimated progress:', (estimatedProgress * 100).toFixed(1) + '%');
        }
      }
    );
    
    console.log('[downloadService] Starting download...');
    const downloadPromise = downloadResumable.downloadAsync();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('다운로드 타임아웃 시간이 초과되었습니다.')), 10 * 60 * 1000);
    });
    const result = await Promise.race([downloadPromise, timeoutPromise]);
    
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    
    console.log('[downloadService] Download result:', {
      uri: result?.uri,
      status: result?.status,
      headers: result?.headers,
      hasResult: !!result
    });
    
    if (result && result.uri) {
      let fileInfo = await FileSystem.getInfoAsync(result.uri);
      
      console.log('[downloadService] File info after download:', {
        exists: fileInfo.exists,
        size: fileInfo.size,
        uri: result.uri
      });
      
      if (!fileInfo.exists) {
        throw new Error('다운로드된 파일을 찾을 수 없습니다. 다운로드를 다시 시도해주세요.');
      }
      
      if (!fileInfo.size || fileInfo.size === 0) {
        console.error('[downloadService] Downloaded file size is zero:', fileInfo.size, 'bytes');
        console.error('[downloadService] Download URL was:', downloadUrl);
        console.error('[downloadService] Max downloaded size during progress:', maxDownloadedSize, 'bytes');
        console.error('[downloadService] Result status:', result.status);
        
        // 백엔드 API 응답 확인 - 실제 응답 본문 읽기
        try {
          const testResponse = await fetch(downloadUrl);
          console.error('[downloadService] Test fetch status:', testResponse.status, testResponse.statusText);
          console.error('[downloadService] Test fetch headers:', Object.fromEntries(testResponse.headers.entries()));
          
          const contentType = testResponse.headers.get('content-type') || '';
          const contentLength = testResponse.headers.get('content-length');
          console.error('[downloadService] Content-Type:', contentType);
          console.error('[downloadService] Content-Length:', contentLength);
          
          // Content-Length가 0이면 명확한 에러
          if (contentLength && parseInt(contentLength) === 0) {
            throw new Error('백엔드 서버가 0 바이트 파일을 반환합니다. 해당 영상을 다운로드할 수 없을 수 있습니다.');
          }
          
          // JSON 응답인 경우 (에러 메시지일 수 있음)
          if (contentType.includes('application/json')) {
            const errorData = await testResponse.json().catch(() => ({}));
            console.error('[downloadService] Backend error response:', JSON.stringify(errorData, null, 2));
            throw new Error(errorData.error || errorData.message || '백엔드 서버에서 에러를 반환했습니다.');
          } else if (contentType.includes('video')) {
            // 비디오 응답인 경우 - React Native에서는 body가 ReadableStream이 아닐 수 있음
            // Content-Length가 null이면 청크 전송이므로 실제 데이터 확인이 어려움
            // 대신 백엔드가 video/mp4를 반환한다는 것만 확인
            console.error('[downloadService] Backend returned video/mp4 content type');
            console.error('[downloadService] Note: Content-Length is null, using chunked transfer encoding');
            
            // React Native에서는 body.getReader()가 작동하지 않을 수 있으므로
            // FileSystem.createDownloadResumable이 제대로 작동하는지에 의존
            // 만약 0 바이트로 저장되면 백엔드가 실제로 데이터를 보내지 않는 것
          } else {
            // 텍스트 응답인 경우
            const responseText = await testResponse.text();
            console.error('[downloadService] Backend response (first 500 chars):', responseText.substring(0, 500));
            
            // 응답이 비어있거나 에러 메시지인 경우
            if (responseText.length === 0) {
              throw new Error('백엔드 서버가 빈 응답을 반환했습니다. 해당 영상을 다운로드할 수 없을 수 있습니다.');
            } else if (responseText.length < 100 && (responseText.includes('error') || responseText.includes('Error'))) {
              throw new Error(`백엔드 서버 에러: ${responseText}`);
            }
          }
        } catch (testError) {
          console.error('[downloadService] Test fetch failed:', testError);
          // testError가 이미 throw된 Error면 그대로 전달
          if (testError instanceof Error && testError.message) {
            throw testError;
          }
    }

    try {
          await FileSystem.deleteAsync(result.uri, { idempotent: true });
        } catch (deleteError) {
          console.warn('[downloadService] Could not delete incomplete file:', deleteError);
        }
        throw new Error('다운로드된 파일의 크기가 0입니다. 백엔드 서버에서 파일을 제공하지 못했을 수 있습니다. 다운로드를 다시 시도해주세요.');
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      fileInfo = await FileSystem.getInfoAsync(result.uri);
      
      if (!fileInfo.exists || fileInfo.size === 0) {
        throw new Error('다운로드된 파일이 완전하지 않습니다. 다운로드를 다시 시도해주세요.');
      }
      
      console.log('[downloadService] Video downloaded:', result.uri, 'Size:', (fileInfo.size / (1024 * 1024)).toFixed(2), 'MB');
      
      // 다운로드 완료 후 썸네일 다운로드 및 메타데이터 저장
      if (videoId && internalFileName) {
        try {
          // 썸네일 다운로드 및 캐시 저장
          if (thumbnailUrl) {
            await downloadThumbnail(videoId, thumbnailUrl);
          }
          
          // 메타데이터 저장 (내부 파일명 기준) - status를 completed로 업데이트
          const downloadTimestamp = Date.now(); // 밀리초 단위 타임스탬프
          const metadata = {
            title: videoTitle,
            videoId,
            displayFileName, // 외부 저장소용 원래 파일명 저장
            thumbnail: thumbnailUrl,
            downloadUrl: videoUrl,
            status: 'completed', // 다운로드 완료
            downloadedAt: new Date(downloadTimestamp).toISOString(), // ISO 문자열로 저장
            downloadedAtTimestamp: downloadTimestamp, // 숫자 타임스탬프도 저장 (정렬용)
          };
          
          const metadataFileName = `${internalFileName}.json`; // 확장자 포함: {videoId}.mp4.json
          const metadataUri = `${METADATA_DIR}${metadataFileName}`;
          
          await FileSystem.writeAsStringAsync(metadataUri, JSON.stringify(metadata));
          console.log('[downloadService] Metadata saved for video with status: completed:', internalFileName);
    } catch (error) {
          console.error('[downloadService] Error saving thumbnail/metadata (non-critical):', error);
          // 썸네일/메타데이터 저장 실패는 다운로드 성공을 막지 않음
        }
      }
      
      currentFileUri = null;
      
      if (onProgress) {
        onProgress(1.0);
      }
      
      // ✅ {uri, fileName} 형태로 반환 (fileName은 외부 저장소용 원래 파일명)
      return { uri: result.uri, fileName: displayFileName };
    } else {
      throw new Error('다운로드가 완료되지 않았습니다.');
    }
      } catch (urlError) {
        lastDownloadError = urlError;
        if (progressInterval) {
          clearInterval(progressInterval);
          progressInterval = null;
        }
        console.warn('[downloadService] Video download failed for URL #' + (urlIndex + 1), apiBaseUrl, urlError?.message);
        if (urlIndex < baseUrls.length - 1) {
          console.log('[downloadService] Trying next URL...');
        }
      }
    }
    if (lastDownloadError) {
      throw lastDownloadError;
    }
    } catch (error) {
    console.error('[downloadService] Error downloading video:', error);
    
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    
    // 에러 발생 시 파일 삭제하지 않고 메타데이터에 status: "downloading" 유지 (이어받기 가능하도록)
    // 파일은 보존하여 나중에 이어받기 가능하도록 함
    if (currentFileUri) {
      console.log('[downloadService] Error occurred, keeping file for resume:', currentFileUri);
      // 메타데이터에 status: "downloading" 유지 (이미 저장되어 있음)
      // 필요시 status를 "error"로 업데이트할 수 있지만, 이어받기를 위해 "downloading" 유지
    }
    
    const isRetryableError = 
      error.message?.includes('connection') ||
      error.message?.includes('abort') ||
      error.message?.includes('network') ||
      error.message?.includes('timeout') ||
      error.message?.includes('ECONNRESET') ||
      error.message?.includes('Software caused connection abort');
    
    if (isRetryableError && retryCount < MAX_RETRIES) {
      console.log(`[downloadService] Retryable error detected, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      currentFileUri = null;
      return downloadVideo(videoUrl, videoTitle, onProgress, retryCount + 1, videoId, thumbnailUrl, shouldResume);
    }
    
    throw error;
  } finally {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }
};

// 오디오 다운로드
export const downloadAudio = async (videoUrl, videoTitle, onProgress, retryCount = 0, videoId = null, thumbnailUrl = null, shouldResume = false) => {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000;
  let currentFileUri = null;
  let progressInterval = null;
  let lastProgress = 0;
  let maxDownloadedSize = 0;
  let expectedSize = null;
  
  try {
    await ensureDirectories();
    
    console.log('[downloadService] Starting audio download:', videoUrl, `(attempt ${retryCount + 1}/${MAX_RETRIES + 1})`, shouldResume ? '(resuming)' : '(new download)');
    console.log('[downloadService] Original audio title:', videoTitle);
    
    // 내부 저장소: videoId로 저장 (짧고 안전한 파일명)
    const internalFileName = videoId 
      ? `${videoId}.m4a`  // videoId가 있으면 videoId 사용
      : `${sanitizeFileName(videoTitle || 'audio', 195)}.m4a`; // 없으면 제목 사용
    const fileUri = `${DOWNLOAD_DIR}${internalFileName}`;
    currentFileUri = fileUri;
    
    // 외부 저장소용 원래 파일명 (사용자에게 보여줄 파일명)
    const displayFileName = `${sanitizeFileName(videoTitle || 'audio', 195)}.m4a`;
    
    console.log('[downloadService] Internal file name:', internalFileName);
    console.log('[downloadService] Display file name:', displayFileName);
    console.log('[downloadService] File URI:', fileUri);
    
    // 이어받기가 아닌 경우에만 기존 파일 삭제
    if (!shouldResume) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (fileInfo.exists) {
          console.log('[downloadService] Existing file found, deleting before re-download:', fileUri);
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
          console.log('[downloadService] Existing file deleted successfully');
        }
      } catch (deleteError) {
        console.warn('[downloadService] Could not delete existing file (may not exist):', deleteError);
      }
    } else {
      console.log('[downloadService] Resuming download, keeping existing file:', fileUri);
    }
    
    // 다운로드 시작 시 메타데이터에 status: "downloading" 저장
    try {
      const downloadTimestamp = Date.now();
      const metadata = {
        title: videoTitle,
        videoId,
        displayFileName,
        thumbnail: thumbnailUrl,
        downloadUrl: videoUrl, // 이어받기 시 필요
        status: 'downloading',
        downloadedAt: new Date(downloadTimestamp).toISOString(),
        downloadedAtTimestamp: downloadTimestamp,
      };
      const metadataFileName = `${internalFileName}.json`;
      const metadataUri = `${METADATA_DIR}${metadataFileName}`;
      await FileSystem.writeAsStringAsync(metadataUri, JSON.stringify(metadata));
      console.log('[downloadService] Metadata saved with status: downloading');
    } catch (metadataError) {
      console.warn('[downloadService] Error saving initial metadata (non-critical):', metadataError);
    }
    
    // 예상 파일 크기 가져오기 (참고용)
    try {
      const videoInfo = await getVideoInfo(videoUrl);
      expectedSize = videoInfo.filesize || null;
      if (expectedSize) {
        console.log('[downloadService] Expected file size:', expectedSize, 'bytes (', (expectedSize / (1024 * 1024)).toFixed(2), 'MB)');
      }
    } catch (error) {
      console.log('[downloadService] Could not get expected file size, proceeding without it:', error.message || error);
      expectedSize = null;
    }
    
    // 이중화: URL 목록 순서대로 시도 (primary 실패 시 Railway 등)
    const baseUrls = await getApiBaseUrls();
    let lastDownloadError = null;
    for (let urlIndex = 0; urlIndex < baseUrls.length; urlIndex++) {
      const apiBaseUrl = baseUrls[urlIndex];
      console.log('[downloadService] Using API base URL for audio download (#', urlIndex + 1, '/', baseUrls.length, '):', apiBaseUrl);
      try {
    const downloadUrl = `${apiBaseUrl.replace(/\/$/, '')}/api/download/audio?url=${encodeURIComponent(videoUrl)}&quality=highestaudio`;
    
    console.log('[downloadService] Downloading from:', downloadUrl);
    console.log('[downloadService] Saving to:', fileUri);
    
    lastProgress = 0;
    maxDownloadedSize = 0;
    
    // 다운로드 시작 시 최소 진행률 표시
    if (onProgress) {
      onProgress(0.01);
      lastProgress = 0.01;
      
      // 폴백으로 진행률 업데이트
      progressInterval = setInterval(() => {
        if (lastProgress < 0.9) {
          lastProgress = Math.min(0.9, lastProgress + 0.05);
          onProgress(lastProgress);
        }
      }, 2000);
    }
    
    const downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      fileUri,
      {},
      (downloadProgress) => {
        console.log('[downloadService] Progress callback:', {
          written: downloadProgress.totalBytesWritten,
          expected: downloadProgress.totalBytesExpectedToWrite
        });
        
        if (downloadProgress.totalBytesWritten > maxDownloadedSize) {
          maxDownloadedSize = downloadProgress.totalBytesWritten;
          console.log('[downloadService] Max downloaded size updated:', maxDownloadedSize, 'bytes (', (maxDownloadedSize / (1024 * 1024)).toFixed(2), 'MB)');
        }
        
        if (downloadProgress.totalBytesExpectedToWrite > 0) {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          if (onProgress) {
            onProgress(progress);
          }
          lastProgress = progress;
          
          if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
      } else {
          // Content-Length가 없으면 다운로드된 바이트로 추정 진행률 계산
          const downloadedMB = downloadProgress.totalBytesWritten / (1024 * 1024);
          let estimatedProgress;
          
          if (downloadedMB < 2) {
            estimatedProgress = downloadedMB / 2 * 0.2;
          } else if (downloadedMB < 5) {
            estimatedProgress = 0.2 + (downloadedMB - 2) / 3 * 0.3;
          } else if (downloadedMB < 10) {
            estimatedProgress = 0.5 + (downloadedMB - 5) / 5 * 0.3;
          } else if (downloadedMB < 20) {
            estimatedProgress = 0.8 + (downloadedMB - 10) / 10 * 0.15;
          } else {
            estimatedProgress = Math.min(0.99, 0.95 + (downloadedMB - 20) / 100 * 0.04);
          }
          
          if (onProgress && downloadedMB > 0) {
            if (progressInterval) {
              clearInterval(progressInterval);
              progressInterval = null;
            }
            
            if (estimatedProgress > lastProgress) {
              onProgress(estimatedProgress);
              lastProgress = estimatedProgress;
            } else if (downloadedMB > 0 && lastProgress < 0.99) {
              const minProgress = Math.min(0.99, lastProgress + 0.001);
              onProgress(minProgress);
              lastProgress = minProgress;
            }
          }
          
          console.log('[downloadService] Downloaded:', downloadedMB.toFixed(2), 'MB, estimated progress:', (estimatedProgress * 100).toFixed(1) + '%');
        }
      }
    );
    
    console.log('[downloadService] Starting download...');
    const downloadPromise = downloadResumable.downloadAsync();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('다운로드 타임아웃 시간이 초과되었습니다.')), 10 * 60 * 1000);
    });
    const result = await Promise.race([downloadPromise, timeoutPromise]);
    
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    
    if (result && result.uri) {
      let fileInfo = await FileSystem.getInfoAsync(result.uri);
      
      if (!fileInfo.exists) {
        throw new Error('다운로드된 파일을 찾을 수 없습니다. 다운로드를 다시 시도해주세요.');
      }
      
      if (!fileInfo.size || fileInfo.size === 0) {
        console.error('[downloadService] Downloaded file size is zero:', fileInfo.size, 'bytes');
        try {
          await FileSystem.deleteAsync(result.uri, { idempotent: true });
        } catch (deleteError) {
          console.warn('[downloadService] Could not delete incomplete file:', deleteError);
        }
        throw new Error('다운로드된 파일의 크기가 0입니다. 다운로드를 다시 시도해주세요.');
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      fileInfo = await FileSystem.getInfoAsync(result.uri);
      
      if (!fileInfo.exists || fileInfo.size === 0) {
        throw new Error('다운로드된 파일이 완전하지 않습니다. 다운로드를 다시 시도해주세요.');
      }
      
      console.log('[downloadService] Audio downloaded:', result.uri, 'Size:', (fileInfo.size / (1024 * 1024)).toFixed(2), 'MB');
      
      // 다운로드 완료 후 썸네일 다운로드 및 메타데이터 저장
      if (videoId && internalFileName) {
        try {
          // 썸네일 다운로드 및 캐시 저장
          if (thumbnailUrl) {
            await downloadThumbnail(videoId, thumbnailUrl);
          }
          
          // 메타데이터 저장 (내부 파일명 기준) - status를 completed로 업데이트
          const downloadTimestamp = Date.now(); // 밀리초 단위 타임스탬프
          const metadata = {
            title: videoTitle,
            videoId,
            displayFileName, // 외부 저장소용 원래 파일명 저장
            thumbnail: thumbnailUrl,
            downloadUrl: videoUrl,
            status: 'completed', // 다운로드 완료
            downloadedAt: new Date(downloadTimestamp).toISOString(), // ISO 문자열로 저장
            downloadedAtTimestamp: downloadTimestamp, // 숫자 타임스탬프도 저장 (정렬용)
          };
          
          const metadataFileName = `${internalFileName}.json`; // 확장자 포함: {videoId}.m4a.json
          const metadataUri = `${METADATA_DIR}${metadataFileName}`;
          
          await FileSystem.writeAsStringAsync(metadataUri, JSON.stringify(metadata));
          console.log('[downloadService] Metadata saved for audio with status: completed:', internalFileName);
              } catch (error) {
          console.error('[downloadService] Error saving thumbnail/metadata (non-critical):', error);
          // 썸네일/메타데이터 저장 실패는 다운로드 성공을 막지 않음
        }
      }
      
      currentFileUri = null;
      
      if (onProgress) {
        onProgress(1.0);
      }
      
      // ✅ {uri, fileName} 형태로 반환 (fileName은 외부 저장소용 원래 파일명)
      return { uri: result.uri, fileName: displayFileName };
      } else {
      throw new Error('다운로드가 완료되지 않았습니다.');
      }
      } catch (urlError) {
        lastDownloadError = urlError;
        if (progressInterval) {
          clearInterval(progressInterval);
          progressInterval = null;
        }
        console.warn('[downloadService] Audio download failed for URL #' + (urlIndex + 1), apiBaseUrl, urlError?.message);
        if (urlIndex < baseUrls.length - 1) {
          console.log('[downloadService] Trying next URL...');
        }
      }
    }
    if (lastDownloadError) {
      throw lastDownloadError;
    }
    } catch (error) {
    console.error('[downloadService] Error downloading audio:', error);
    
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    
    // 에러 발생 시 파일 삭제하지 않고 메타데이터에 status: "downloading" 유지 (이어받기 가능하도록)
    // 파일은 보존하여 나중에 이어받기 가능하도록 함
    if (currentFileUri) {
      console.log('[downloadService] Error occurred, keeping file for resume:', currentFileUri);
      // 메타데이터에 status: "downloading" 유지 (이미 저장되어 있음)
      // 필요시 status를 "error"로 업데이트할 수 있지만, 이어받기를 위해 "downloading" 유지
    }
    
    const isRetryableError = 
      error.message?.includes('connection') ||
      error.message?.includes('abort') ||
      error.message?.includes('network') ||
      error.message?.includes('timeout') ||
      error.message?.includes('ECONNRESET') ||
      error.message?.includes('Software caused connection abort');
    
    if (isRetryableError && retryCount < MAX_RETRIES) {
      console.log(`[downloadService] Retryable error detected, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      currentFileUri = null;
      return downloadAudio(videoUrl, videoTitle, onProgress, retryCount + 1, videoId, thumbnailUrl, shouldResume);
    }
    
    throw error;
  } finally {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }
};

// 이어받기 함수 (resume download)
export const resumeDownload = async (videoId, isVideo = true, onProgress = null) => {
  try {
    await ensureDirectories();
    
    // 내부 파일명 생성
    const extension = isVideo ? '.mp4' : '.m4a';
    const internalFileName = `${videoId}${extension}`;
    const fileUri = `${DOWNLOAD_DIR}${internalFileName}`;
    const metadataFileName = `${internalFileName}.json`;
    const metadataUri = `${METADATA_DIR}${metadataFileName}`;
    
    // 메타데이터 읽기
    let metadata = {};
    try {
      const metadataInfo = await FileSystem.getInfoAsync(metadataUri);
      if (metadataInfo.exists) {
        const metadataContent = await FileSystem.readAsStringAsync(metadataUri);
        metadata = JSON.parse(metadataContent);
      } else {
        throw new Error('메타데이터를 찾을 수 없습니다.');
      }
    } catch (error) {
      console.error('[downloadService] Error reading metadata for resume:', error);
      throw new Error('이어받기할 수 없습니다. 메타데이터를 찾을 수 없습니다.');
    }
    
    // status 확인
    if (metadata.status !== 'downloading') {
      throw new Error('이어받기할 수 없습니다. 다운로드가 완료되었거나 상태가 올바르지 않습니다.');
    }
    
    // downloadUrl 확인
    if (!metadata.downloadUrl) {
      throw new Error('이어받기할 수 없습니다. 다운로드 URL을 찾을 수 없습니다.');
    }
    
    // 파일 존재 확인
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists || fileInfo.size === 0) {
      throw new Error('이어받기할 수 없습니다. 파일이 존재하지 않거나 크기가 0입니다.');
    }
    
    console.log('[downloadService] Resuming download:', fileUri, 'Current size:', fileInfo.size, 'bytes');
    
    // createDownloadResumable으로 이어받기
    const downloadResumable = FileSystem.createDownloadResumable(
      metadata.downloadUrl,
      fileUri,
      {},
      (downloadProgress) => {
        if (downloadProgress.totalBytesExpectedToWrite > 0) {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          if (onProgress) {
            onProgress(progress);
          }
        }
      }
    );
    
    // resumeAsync() 호출
    const result = await downloadResumable.resumeAsync();
    
    if (result && result.uri) {
      // 다운로드 완료 확인
      let finalFileInfo = await FileSystem.getInfoAsync(result.uri);
      
      if (!finalFileInfo.exists || finalFileInfo.size === 0) {
        throw new Error('이어받기가 완료되지 않았습니다.');
      }
      
      // 메타데이터 업데이트 (status: "completed")
      const downloadTimestamp = Date.now();
      metadata.status = 'completed';
      metadata.downloadedAt = new Date(downloadTimestamp).toISOString();
      metadata.downloadedAtTimestamp = downloadTimestamp;
      
      await FileSystem.writeAsStringAsync(metadataUri, JSON.stringify(metadata));
      console.log('[downloadService] Resume completed, metadata updated to completed');
      
      if (onProgress) {
        onProgress(1.0);
      }
      
      return { uri: result.uri, fileName: metadata.displayFileName };
    } else {
      throw new Error('이어받기가 완료되지 않았습니다.');
    }
  } catch (error) {
    console.error('[downloadService] Error resuming download:', error);
    throw error;
  }
};

// 파일 메타데이터 삭제
export const deleteFileWithMetadata = async (fileName, videoId) => {
  try {
    // 메타데이터 파일 삭제 (확장자 포함: {videoId}.mp4.json 또는 {videoId}.m4a.json)
    const metadataFileName = `${fileName}.json`;
    const metadataUri = `${METADATA_DIR}${metadataFileName}`;
    
    try {
      const metadataInfo = await FileSystem.getInfoAsync(metadataUri);
      if (metadataInfo.exists) {
        await FileSystem.deleteAsync(metadataUri, { idempotent: true });
      }
                              } catch (error) {
      console.warn('[downloadService] Error deleting metadata:', error);
    }
    
    // 썸네일 캐시 삭제 (사용되지 않는 경우)
    if (videoId) {
      await deleteThumbnailCacheIfUnused(videoId);
      }
    } catch (error) {
    console.error('[downloadService] Error deleting file metadata:', error);
  }
};

// 썸네일 다운로드 및 캐시 저장
export const downloadThumbnail = async (videoId, thumbnailUrl) => {
  try {
    await ensureThumbnailCacheDir();
    
    if (!thumbnailUrl || !videoId) {
      console.warn('[downloadService] No thumbnail URL or videoId provided:', { videoId, thumbnailUrl });
      return null;
    }
    
    const thumbnailPath = `${THUMBNAIL_CACHE_DIR}${videoId}.jpg`;
    
    // 이미 캐시가 있으면 스킵
    const existingCache = await FileSystem.getInfoAsync(thumbnailPath);
    if (existingCache.exists) {
      console.log('[downloadService] Thumbnail cache already exists:', videoId);
      return thumbnailPath;
    }
    
    console.log('[downloadService] Downloading thumbnail:', thumbnailUrl, 'to:', thumbnailPath);
    
    // 썸네일 다운로드
    const downloadResult = await FileSystem.downloadAsync(thumbnailUrl, thumbnailPath);
    
    if (downloadResult.status === 200) {
      console.log('[downloadService] Thumbnail cached successfully:', videoId);
      return thumbnailPath;
    } else {
      console.warn('[downloadService] Failed to download thumbnail, status:', downloadResult.status);
      return null;
    }
  } catch (error) {
    console.error('[downloadService] Error downloading thumbnail:', error);
    return null;
  }
};

// 썸네일 캐시 경로 가져오기
export const getThumbnailCachePath = async (videoId) => {
  try {
    if (!videoId) return null;
    
    await ensureDirectories();
    
    const cacheFileName = `${videoId}.jpg`;
    const cacheUri = `${THUMBNAIL_CACHE_DIR}${cacheFileName}`;
    
    const cacheInfo = await FileSystem.getInfoAsync(cacheUri);
    if (cacheInfo.exists) {
      return cacheUri;
    }
    
    return null;
                              } catch (error) {
    console.error('[downloadService] Error getting thumbnail cache path:', error);
    return null;
  }
};

// 사용되지 않는 썸네일 캐시 삭제 (찜하기와 다운로드 파일 둘 다 확인)
export const deleteThumbnailCacheIfUnused = async (videoId) => {
  try {
    if (!videoId) return false;
    
    // 찜하기에 있는지 확인
    let hasFavorite = false;
    try {
      const { isFavorite } = await import('./database');
      hasFavorite = await isFavorite(videoId);
    } catch (error) {
      console.warn('[downloadService] Error checking favorite:', error);
    }
    
    // 다운로드된 파일 목록 확인
    const downloadedFiles = await getDownloadedFiles();
    const hasDownloadedFile = downloadedFiles.some(file => file.videoId === videoId);
    
    // 둘 다 사용되지 않으면 삭제
    if (!hasFavorite && !hasDownloadedFile) {
      const thumbnailPath = `${THUMBNAIL_CACHE_DIR}${videoId}.jpg`;
      const fileInfo = await FileSystem.getInfoAsync(thumbnailPath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(thumbnailPath, { idempotent: true });
        console.log('[downloadService] Thumbnail cache deleted (unused):', videoId);
        return true;
      }
    } else {
      console.log('[downloadService] Thumbnail cache kept (in use):', videoId, {
        hasFavorite,
        hasDownloadedFile
      });
    }
    return false;
  } catch (error) {
    console.error('[downloadService] Error deleting thumbnail cache:', error);
    return false;
  }
};

// 영상 검색 (이중화: primary 실패 시 Railway 등 다음 URL로 재시도)
export const searchVideos = async (searchQuery, maxResults = 20) => {
  try {
    console.log('[downloadService] Searching videos for:', searchQuery);
    const response = await fetchWithFallback('/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: searchQuery, maxResults: maxResults }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || errorData.error || '검색에 실패했습니다.');
    }
    
    const data = await response.json();
    
    // API 응답을 앱에서 사용하는 형식으로 변환
    const results = data.items.map(item => ({
      id: item.id.videoId,
      title: decodeHtmlEntities(item.snippet.title),
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
      author: decodeHtmlEntities(item.snippet.channelTitle),
      authorUrl: `https://www.youtube.com/channel/${item.snippet.channelId}`,
      description: decodeHtmlEntities(item.snippet.description),
      publishedAt: item.snippet.publishedAt,
    }));
    
    return results;
  } catch (error) {
    console.error('[downloadService] Error searching videos:', error);
    throw error;
  }
};

// 자동완성 가져오기 (이중화: primary 실패 시 다음 URL로 재시도)
export const getAutocomplete = async (query) => {
  try {
    if (!query || query.trim().length < 2) {
      return [];
    }

    console.log('[downloadService] Getting autocomplete for:', query);
    const response = await fetchWithFallback('/api/autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query.trim() }),
    });
    
    if (!response.ok) {
      // 400 에러는 서버 측 문제이므로 경고만 표시 (에러 로그는 최소화)
      if (response.status === 400) {
        console.warn('[downloadService] Autocomplete server returned 400 (non-critical)');
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.warn('[downloadService] Autocomplete server error:', response.status, errorData.error || '');
      }
      // 자동완성 실패는 치명적이지 않으므로 빈 배열 반환 (에러를 throw하지 않음)
      return [];
    }
    
    const suggestions = await response.json();
    return Array.isArray(suggestions) ? suggestions : [];
  } catch (error) {
    // 자동완성 실패는 치명적이지 않으므로 경고만 표시 (에러 로그는 최소화)
    console.warn('[downloadService] Autocomplete failed (non-critical):', error.message);
    // 자동완성 실패는 치명적이지 않으므로 빈 배열 반환
    return [];
  }
};
