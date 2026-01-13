import * as FileSystem from 'expo-file-system/legacy';
import { Platform, Alert, NativeModules } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { API_BASE_URL, getApiBaseUrl } from '../config/api';
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
// 썸네일 캐시 디렉토리 경로
const THUMBNAIL_CACHE_DIR = `${FileSystem.documentDirectory}thumbnails/`;
// 메타데이터 파일 경로
const METADATA_FILE = `${FileSystem.documentDirectory}download_metadata.json`;

// 다운로드 디렉토리 생성
const ensureDownloadDir = async () => {
  const dirInfo = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
    console.log('[DownloadService] Download directory created');
  }
};

// 썸네일 캐시 디렉토리 생성
const ensureThumbnailCacheDir = async () => {
  const dirInfo = await FileSystem.getInfoAsync(THUMBNAIL_CACHE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(THUMBNAIL_CACHE_DIR, { intermediates: true });
    console.log('[DownloadService] Thumbnail cache directory created');
  }
};

// YouTube 영상 정보 가져오기
export const getVideoInfo = async (videoUrl) => {
  try {
    console.log('[DownloadService] Getting video info for:', videoUrl);
    
    // 동적으로 API URL 가져오기 (외부 config.json에서)
    const apiBaseUrl = await getApiBaseUrl();
    console.log('[DownloadService] Using API base URL:', apiBaseUrl);
    
    const response = await fetch(`${apiBaseUrl}/api/video-info`, {
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

// YouTube 영상 검색
export const searchYouTubeVideos = async (searchQuery, maxResults = 20) => {
  try {
    console.log('[DownloadService] Searching YouTube for:', searchQuery);
    const apiBaseUrl = await getApiBaseUrl();
    
    const response = await fetch(`${apiBaseUrl}/api/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: searchQuery, maxResults: maxResults }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // 서버의 message를 우선 사용 (제한 초과 등의 경우)
      throw new Error(errorData.message || errorData.error || '검색에 실패했습니다.');
    }
    
    const data = await response.json();
    
    // YouTube API 응답을 앱에서 사용할 수 있는 형식으로 변환
    const results = data.items.map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
      author: item.snippet.channelTitle,
      authorUrl: `https://www.youtube.com/channel/${item.snippet.channelId}`,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
    }));
    
    return results;
  } catch (error) {
    console.error('[DownloadService] Error searching YouTube:', error);
    throw error;
  }
};

// YouTube 자동완성 가져오기
export const getYouTubeAutocomplete = async (query) => {
  try {
    if (!query || query.trim().length < 2) {
      return [];
    }

    console.log('[DownloadService] Getting autocomplete for:', query);
    const apiBaseUrl = await getApiBaseUrl();
    
    const response = await fetch(`${apiBaseUrl}/api/autocomplete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query.trim() }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[DownloadService] Autocomplete server error:', {
        status: response.status,
        statusText: response.statusText,
        errorData: errorData,
      });
      throw new Error(errorData.error || '자동완성에 실패했습니다.');
    }
    
    const suggestions = await response.json();
    return Array.isArray(suggestions) ? suggestions : [];
  } catch (error) {
    console.error('[DownloadService] Error getting autocomplete:', error);
    console.error('[DownloadService] Autocomplete error details:', {
      message: error.message,
      stack: error.stack,
    });
    // 자동완성 실패는 치명적이지 않으므로 빈 배열 반환
    return [];
  }
};

// 영상 다운로드 (재시도 로직 포함)
export const downloadVideo = async (videoUrl, videoTitle, onProgress, retryCount = 0, videoId = null, thumbnailUrl = null) => {
  const MAX_RETRIES = 3; // 최대 3번 재시도
  const RETRY_DELAY = 2000; // 재시도 전 2초 대기
  let currentFileUri = null; // 현재 다운로드 중인 파일 URI 저장 (정리용)
  let progressInterval = null; // 진행률 업데이트 interval (catch/finally에서 접근 가능하도록 함수 상단에 선언)
  let lastProgress = 0; // 마지막 진행률
  let maxDownloadedSize = 0; // 다운로드 중 최대 다운로드 크기 추적 (파일 완전성 검증용)
  let expectedSize = null; // 예상 파일 크기 (서버에서 받아온 filesize)
  
  try {
    await ensureDownloadDir();
    
    console.log('[DownloadService] Starting video download:', videoUrl, `(attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
    console.log('[DownloadService] Original video title:', videoTitle);
    
    // 파일명 생성: 확장자(.mp4) 공간을 고려하여 195자로 제한
    const baseFileName = sanitizeFileName(videoTitle || 'video', 195);
    const fileName = `${baseFileName}.mp4`;
    const fileUri = `${DOWNLOAD_DIR}${fileName}`;
    currentFileUri = fileUri; // 파일 URI 저장 (정리용)
    
    console.log('[DownloadService] Generated file name:', fileName);
    console.log('[DownloadService] File URI:', fileUri);
    
    // ✅ 무조건 기존 파일 삭제하고 새로 받기
    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.exists) {
        console.log('[DownloadService] Existing file found, deleting before re-download:', fileUri);
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
        console.log('[DownloadService] Existing file deleted successfully');
      }
    } catch (deleteError) {
      console.warn('[DownloadService] Could not delete existing file (may not exist):', deleteError);
    }
    
    // 예상 파일 크기 가져오기 (참고용으로만 사용, 검증 로직 없음)
    try {
      const videoInfo = await getVideoInfo(videoUrl);
      expectedSize = videoInfo.filesize || null;
      if (expectedSize) {
        console.log('[DownloadService] Expected file size:', expectedSize, 'bytes (', (expectedSize / (1024 * 1024)).toFixed(2), 'MB)');
      }
    } catch (error) {
      console.log('[DownloadService] Could not get expected file size, proceeding without it:', error.message || error);
      expectedSize = null;
    }
    
    // 동적으로 API URL 가져오기 (외부 config.json에서)
    const apiBaseUrl = await getApiBaseUrl();
    console.log('[DownloadService] Using API base URL for video download:', apiBaseUrl);
    
    // 백엔드 서버에서 직접 다운로드
    const downloadUrl = `${apiBaseUrl}/api/download/video?url=${encodeURIComponent(videoUrl)}&quality=highestvideo`;
    
    console.log('[DownloadService] Downloading from:', downloadUrl);
    console.log('[DownloadService] Saving to:', fileUri);
    
    // FileSystem.createDownloadResumable 사용
    // YouTube 스트림은 Content-Length를 제공하지 않으므로 정확한 진행률 계산 불가
    lastProgress = 0;
    maxDownloadedSize = 0; // 최대 다운로드 크기 초기화
    
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
        
        // ✅ 최대 다운로드 크기 추적 (파일 완전성 검증용)
        if (downloadProgress.totalBytesWritten > maxDownloadedSize) {
          maxDownloadedSize = downloadProgress.totalBytesWritten;
          console.log('[DownloadService] Max downloaded size updated:', maxDownloadedSize, 'bytes (', (maxDownloadedSize / (1024 * 1024)).toFixed(2), 'MB)');
        }
        
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
          
          // 다운로드 속도 기반으로 추정 진행률 계산
          // 초기에는 작게 시작하고, 다운로드가 진행될수록 점진적으로 증가
          // 100MB 기준으로 시작하되, 실제 다운로드된 크기에 따라 동적으로 조정
          let estimatedProgress;
          
          if (downloadedMB < 10) {
            // 초기 10MB까지는 선형적으로 증가 (0% ~ 10%)
            estimatedProgress = downloadedMB / 10 * 0.1;
          } else if (downloadedMB < 50) {
            // 10MB ~ 50MB: 10% ~ 50%
            estimatedProgress = 0.1 + (downloadedMB - 10) / 40 * 0.4;
          } else if (downloadedMB < 100) {
            // 50MB ~ 100MB: 50% ~ 80%
            estimatedProgress = 0.5 + (downloadedMB - 50) / 50 * 0.3;
          } else if (downloadedMB < 200) {
            // 100MB ~ 200MB: 80% ~ 95%
            estimatedProgress = 0.8 + (downloadedMB - 100) / 100 * 0.15;
          } else {
            // 200MB 이상: 95% ~ 99% (계속 증가하지만 완료는 아님)
            estimatedProgress = Math.min(0.99, 0.95 + (downloadedMB - 200) / 500 * 0.04);
          }
          
          // 다운로드가 진행 중이면 진행률 업데이트 (항상 증가하도록)
          if (onProgress && downloadedMB > 0) {
            // interval 정리하고 실제 진행률 사용
            if (progressInterval) {
              clearInterval(progressInterval);
              progressInterval = null;
            }
            
            // 다운로드된 바이트가 증가하면 진행률도 증가
            if (estimatedProgress > lastProgress) {
              onProgress(estimatedProgress);
              lastProgress = estimatedProgress;
            } else if (downloadedMB > 0 && lastProgress < 0.99) {
              // 다운로드는 진행 중이지만 추정 진행률이 증가하지 않는 경우
              // 최소한 0.1%씩은 증가시켜서 사용자에게 진행 중임을 알림
              const minProgress = Math.min(0.99, lastProgress + 0.001);
              onProgress(minProgress);
              lastProgress = minProgress;
            }
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
      // 다운로드된 파일 확인 (다운로드 직후 즉시 확인)
      let fileInfo = await FileSystem.getInfoAsync(result.uri);
      
      // 파일이 없거나 크기가 너무 작으면 오류
      if (!fileInfo.exists) {
        throw new Error('다운로드된 파일을 찾을 수 없습니다. 다운로드를 다시 시도해주세요.');
      }
      
      if (!fileInfo.size || fileInfo.size < 1024 * 1024) { // 1MB 미만이면 오류
        console.error('[DownloadService] Downloaded file size is too small:', fileInfo.size, 'bytes');
        // 불완전한 파일 삭제
        try {
          await FileSystem.deleteAsync(result.uri, { idempotent: true });
        } catch (deleteError) {
          console.warn('[DownloadService] Could not delete incomplete file:', deleteError);
        }
        throw new Error('다운로드된 파일의 크기가 너무 작습니다. 다운로드를 다시 시도해주세요.');
      }
      
      // 파일이 실제로 읽을 수 있는지 재확인 (다른 앱으로 갔다가 돌아온 경우 대비)
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms 대기
      fileInfo = await FileSystem.getInfoAsync(result.uri);
      
      if (!fileInfo.exists || fileInfo.size < 1024 * 1024) {
        throw new Error('다운로드된 파일을 확인할 수 없습니다. 다운로드를 다시 시도해주세요.');
      }
      
      console.log('[DownloadService] Video downloaded:', result.uri, 'Size:', (fileInfo.size / (1024 * 1024)).toFixed(2), 'MB');
      
      // ✅ 다운로드 완료 후 썸네일 다운로드 및 메타데이터 저장
      if (videoId && fileName) {
        try {
          // 썸네일 다운로드 및 캐시 저장
          if (thumbnailUrl) {
            await downloadThumbnail(videoId, thumbnailUrl);
          }
          
          // 메타데이터 저장
          const metadata = await getMetadata();
          metadata[fileName] = {
            videoId,
            thumbnailUrl: thumbnailUrl || null,
            type: 'video',
            downloadedAt: Date.now()
          };
          await saveMetadata(metadata);
          console.log('[DownloadService] Metadata saved for video:', fileName);
        } catch (error) {
          console.error('[DownloadService] Error saving thumbnail/metadata (non-critical):', error);
          // 썸네일 저장 실패는 다운로드 성공을 막지 않음
        }
      }
      
      currentFileUri = null;
      
      if (onProgress) {
        onProgress(1.0);
      }
      return result.uri;
    } else {
      throw new Error('다운로드가 완료되지 않았습니다.');
    }
  } catch (error) {
    console.error('[DownloadService] Error downloading video:', error);
    
    // interval 정리
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    
    // ✅ 에러 발생 시 현재 다운로드 중인 파일 삭제 (불완전한 파일)
    if (currentFileUri) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(currentFileUri);
        if (fileInfo.exists) {
          console.log('[DownloadService] Deleting incomplete file due to error:', currentFileUri);
          await FileSystem.deleteAsync(currentFileUri, { idempotent: true });
        }
      } catch (deleteError) {
        console.warn('[DownloadService] Could not delete incomplete file:', deleteError);
      }
    }
    
    // 네트워크 오류 재시도 로직
    const isRetryableError = 
      error.message?.includes('connection') ||
      error.message?.includes('abort') ||
      error.message?.includes('network') ||
      error.message?.includes('timeout') ||
      error.message?.includes('ECONNRESET') ||
      error.message?.includes('Software caused connection abort');
    
    if (isRetryableError && retryCount < MAX_RETRIES) {
      console.log(`[DownloadService] Retryable error detected, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      currentFileUri = null;
      return downloadVideo(videoUrl, videoTitle, onProgress, retryCount + 1, videoId, thumbnailUrl);
    }
    
    throw error;
  } finally {
    // interval 정리만
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }
};

// 음악 다운로드 (오디오만, 재시도 로직 포함)
export const downloadAudio = async (videoUrl, videoTitle, onProgress, retryCount = 0, videoId = null, thumbnailUrl = null) => {
  const MAX_RETRIES = 3; // 최대 3번 재시도
  const RETRY_DELAY = 2000; // 재시도 전 2초 대기
  let currentFileUri = null; // 현재 다운로드 중인 파일 URI 저장 (정리용)
  let progressInterval = null; // 진행률 업데이트 interval (catch/finally에서 접근 가능하도록 함수 상단에 선언)
  let lastProgress = 0; // 마지막 진행률
  let maxDownloadedSize = 0; // 다운로드 중 최대 다운로드 크기 추적 (파일 완전성 검증용)
  let expectedSize = null; // 예상 파일 크기 (서버에서 받아온 filesize)
  
  try {
    await ensureDownloadDir();
    
    console.log('[DownloadService] Starting audio download:', videoUrl, `(attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
    console.log('[DownloadService] Original audio title:', videoTitle);
    
    // 파일명 생성: 확장자(.m4a) 공간을 고려하여 195자로 제한
    const baseFileName = sanitizeFileName(videoTitle || 'audio', 195);
    const fileName = `${baseFileName}.m4a`;
    const fileUri = `${DOWNLOAD_DIR}${fileName}`;
    currentFileUri = fileUri; // 파일 URI 저장 (정리용)
    
    console.log('[DownloadService] Generated file name:', fileName);
    console.log('[DownloadService] File URI:', fileUri);
    
    // ✅ 무조건 기존 파일 삭제하고 새로 받기
    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.exists) {
        console.log('[DownloadService] Existing file found, deleting before re-download:', fileUri);
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
        console.log('[DownloadService] Existing file deleted successfully');
      }
    } catch (deleteError) {
      console.warn('[DownloadService] Could not delete existing file (may not exist):', deleteError);
    }
    
    // 예상 파일 크기 가져오기 (참고용으로만 사용, 검증 로직 없음)
    try {
      const videoInfo = await getVideoInfo(videoUrl);
      expectedSize = videoInfo.filesize || null;
      if (expectedSize) {
        console.log('[DownloadService] Expected file size:', expectedSize, 'bytes (', (expectedSize / (1024 * 1024)).toFixed(2), 'MB)');
      }
    } catch (error) {
      console.log('[DownloadService] Could not get expected file size, proceeding without it:', error.message || error);
      expectedSize = null;
    }
    
    // 동적으로 API URL 가져오기 (외부 config.json에서)
    const apiBaseUrl = await getApiBaseUrl();
    console.log('[DownloadService] Using API base URL for audio download:', apiBaseUrl);
    
    // 백엔드 서버에서 직접 다운로드
    const downloadUrl = `${apiBaseUrl}/api/download/audio?url=${encodeURIComponent(videoUrl)}&quality=highestaudio`;
    
    console.log('[DownloadService] Downloading from:', downloadUrl);
    console.log('[DownloadService] Saving to:', fileUri);
    
    // FileSystem.createDownloadResumable 사용
    lastProgress = 0;
    maxDownloadedSize = 0; // 최대 다운로드 크기 초기화
    
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
        
        // ✅ 최대 다운로드 크기 추적 (파일 완전성 검증용)
        if (downloadProgress.totalBytesWritten > maxDownloadedSize) {
          maxDownloadedSize = downloadProgress.totalBytesWritten;
          console.log('[DownloadService] Max downloaded size updated:', maxDownloadedSize, 'bytes (', (maxDownloadedSize / (1024 * 1024)).toFixed(2), 'MB)');
        }
        
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
          
          // 다운로드 속도 기반으로 추정 진행률 계산
          // 오디오는 일반적으로 영상보다 작으므로 더 빠르게 진행률 증가
          let estimatedProgress;
          
          if (downloadedMB < 2) {
            // 초기 2MB까지는 선형적으로 증가 (0% ~ 20%)
            estimatedProgress = downloadedMB / 2 * 0.2;
          } else if (downloadedMB < 5) {
            // 2MB ~ 5MB: 20% ~ 50%
            estimatedProgress = 0.2 + (downloadedMB - 2) / 3 * 0.3;
          } else if (downloadedMB < 10) {
            // 5MB ~ 10MB: 50% ~ 80%
            estimatedProgress = 0.5 + (downloadedMB - 5) / 5 * 0.3;
          } else if (downloadedMB < 20) {
            // 10MB ~ 20MB: 80% ~ 95%
            estimatedProgress = 0.8 + (downloadedMB - 10) / 10 * 0.15;
          } else {
            // 20MB 이상: 95% ~ 99% (계속 증가하지만 완료는 아님)
            estimatedProgress = Math.min(0.99, 0.95 + (downloadedMB - 20) / 100 * 0.04);
          }
          
          // 다운로드가 진행 중이면 진행률 업데이트 (항상 증가하도록)
          if (onProgress && downloadedMB > 0) {
            // interval 정리하고 실제 진행률 사용
            if (progressInterval) {
              clearInterval(progressInterval);
              progressInterval = null;
            }
            
            // 다운로드된 바이트가 증가하면 진행률도 증가
            if (estimatedProgress > lastProgress) {
              onProgress(estimatedProgress);
              lastProgress = estimatedProgress;
            } else if (downloadedMB > 0 && lastProgress < 0.99) {
              // 다운로드는 진행 중이지만 추정 진행률이 증가하지 않는 경우
              // 최소한 0.1%씩은 증가시켜서 사용자에게 진행 중임을 알림
              const minProgress = Math.min(0.99, lastProgress + 0.001);
              onProgress(minProgress);
              lastProgress = minProgress;
            }
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
      // 다운로드된 파일 확인 (다운로드 직후 즉시 확인)
      let fileInfo = await FileSystem.getInfoAsync(result.uri);
      
      // 파일이 없거나 크기가 너무 작으면 오류
      if (!fileInfo.exists) {
        throw new Error('다운로드된 파일을 찾을 수 없습니다. 다운로드를 다시 시도해주세요.');
      }
      
      if (!fileInfo.size || fileInfo.size < 100 * 1024) { // 100KB 미만이면 오류
        console.error('[DownloadService] Downloaded file size is too small:', fileInfo.size, 'bytes');
        // 불완전한 파일 삭제
        try {
          await FileSystem.deleteAsync(result.uri, { idempotent: true });
        } catch (deleteError) {
          console.warn('[DownloadService] Could not delete incomplete file:', deleteError);
        }
        throw new Error('다운로드된 파일의 크기가 너무 작습니다. 다운로드를 다시 시도해주세요.');
      }
      
      // 파일이 실제로 읽을 수 있는지 재확인 (다른 앱으로 갔다가 돌아온 경우 대비)
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms 대기
      fileInfo = await FileSystem.getInfoAsync(result.uri);
      
      if (!fileInfo.exists || fileInfo.size < 100 * 1024) {
        throw new Error('다운로드된 파일을 확인할 수 없습니다. 다운로드를 다시 시도해주세요.');
      }
      
      console.log('[DownloadService] Audio downloaded:', result.uri, 'Size:', (fileInfo.size / (1024 * 1024)).toFixed(2), 'MB');
      
      // ✅ 다운로드 완료 후 썸네일 다운로드 및 메타데이터 저장
      if (videoId && fileName) {
        try {
          // 썸네일 다운로드 및 캐시 저장
          if (thumbnailUrl) {
            await downloadThumbnail(videoId, thumbnailUrl);
          }
          
          // 메타데이터 저장
          const metadata = await getMetadata();
          metadata[fileName] = {
            videoId,
            thumbnailUrl: thumbnailUrl || null,
            type: 'audio',
            downloadedAt: Date.now()
          };
          await saveMetadata(metadata);
          console.log('[DownloadService] Metadata saved for audio:', fileName);
        } catch (error) {
          console.error('[DownloadService] Error saving thumbnail/metadata (non-critical):', error);
          // 썸네일 저장 실패는 다운로드 성공을 막지 않음
        }
      }
      
      currentFileUri = null;
      
      if (onProgress) {
        onProgress(1.0);
      }
      return result.uri;
    } else {
      throw new Error('다운로드가 완료되지 않았습니다.');
    }
  } catch (error) {
    console.error('[DownloadService] Error downloading audio:', error);
    
    // interval 정리
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    
    // ✅ 에러 발생 시 현재 다운로드 중인 파일 삭제 (불완전한 파일)
    if (currentFileUri) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(currentFileUri);
        if (fileInfo.exists) {
          console.log('[DownloadService] Deleting incomplete file due to error:', currentFileUri);
          await FileSystem.deleteAsync(currentFileUri, { idempotent: true });
        }
      } catch (deleteError) {
        console.warn('[DownloadService] Could not delete incomplete file:', deleteError);
      }
    }
    
    // 네트워크 오류 재시도 로직
    const isRetryableError = 
      error.message?.includes('connection') ||
      error.message?.includes('abort') ||
      error.message?.includes('network') ||
      error.message?.includes('timeout') ||
      error.message?.includes('ECONNRESET') ||
      error.message?.includes('Software caused connection abort');
    
    if (isRetryableError && retryCount < MAX_RETRIES) {
      console.log(`[DownloadService] Retryable error detected, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      currentFileUri = null;
      return downloadAudio(videoUrl, videoTitle, onProgress, retryCount + 1, videoId, thumbnailUrl);
    }
    
    throw error;
  } finally {
    // interval 정리만
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }
};

// YouTube 제목을 파일명으로 안전하게 변환
// 간단하게: 특수문자와 공백을 언더스코어로 바꾸기
export const sanitizeFileName = (fileName, maxLength = 200) => {
  if (!fileName || fileName.trim().length === 0) {
    return 'file';
  }
  
  // 1. 이모지 제거 (파일명에 사용할 수 없음)
  let sanitized = fileName
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')  // 이모지 제거
    .trim();
  
  // 2. 파일 시스템에서 허용하지 않는 특수문자를 언더스코어로 변경
  // < > : " / \ | ? * # 는 파일명에 사용할 수 없음
  // [ ] 는 일부 파일 시스템에서 문제가 될 수 있지만, 기존 파일명 형식을 유지하기 위해 유지
  sanitized = sanitized
    .replace(/[<>:"/\\|?*#]/g, '_')  // 기본 특수문자와 #를 언더스코어로 변경
    .replace(/\s+/g, '_')            // 공백을 언더스코어로 변경
    .replace(/_+/g, '_')              // 연속된 언더스코어를 하나로 통합
    .replace(/^_+|_+$/g, '');        // 앞뒤 언더스코어 제거
  
  // 3. 빈 문자열이면 기본값 사용
  if (sanitized.length === 0) {
    sanitized = 'file';
  }
  
  // 4. 파일명 길이 제한
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  // 5. 파일명이 너무 짧거나 특수문자만 있으면 기본값 사용
  if (sanitized.length < 2 || sanitized.match(/^[_\-\.]+$/)) {
    sanitized = 'file';
  }
  
  return sanitized;
};

// 다운로드한 파일을 기기 저장소에 저장 (갤러리/미디어 라이브러리)
// 카카오톡처럼 외부 저장소의 공개 디렉토리(Movies/Music)에 저장
export const saveFileToDevice = async (fileUri, fileName, isVideo = true) => {
  try {
    console.log('[DownloadService] Saving file to device:', fileUri, fileName, 'isVideo:', isVideo);
    
    // ✅ 공유하기와 동일한 방식으로 파일 찾기 (여러 경로 시도)
    console.log('[DownloadService] Checking file existence:', fileUri);
    let fileInfo = await FileSystem.getInfoAsync(fileUri);
    
    if (!fileInfo.exists) {
      // 1. URL 디코딩 시도
      try {
        const decodedUri = decodeURIComponent(fileUri);
        if (decodedUri !== fileUri) {
          console.log('[DownloadService] Trying decoded URI:', decodedUri);
          fileInfo = await FileSystem.getInfoAsync(decodedUri);
          if (fileInfo.exists) {
            fileUri = decodedUri;
            console.log('[DownloadService] ✅ File found with decoded URI');
          }
        }
      } catch (e) {
        console.warn('[DownloadService] Could not decode URI:', e);
      }
      
      // 2. file:// 프로토콜 제거 후 시도
      if (!fileInfo.exists && fileUri.startsWith('file://')) {
        const withoutProtocol = fileUri.replace('file://', '');
        console.log('[DownloadService] Trying URI without file:// protocol:', withoutProtocol);
        fileInfo = await FileSystem.getInfoAsync(withoutProtocol);
        if (fileInfo.exists) {
          fileUri = withoutProtocol;
          console.log('[DownloadService] ✅ File found without file:// protocol');
        }
      }
      
      // 3. file:// 프로토콜 추가 후 시도
      if (!fileInfo.exists && !fileUri.startsWith('file://')) {
        const withProtocol = `file://${fileUri}`;
        console.log('[DownloadService] Trying URI with file:// protocol:', withProtocol);
        fileInfo = await FileSystem.getInfoAsync(withProtocol);
        if (fileInfo.exists) {
          fileUri = withProtocol;
          console.log('[DownloadService] ✅ File found with file:// protocol');
        }
      }
      
      // 4. 파일명으로 경로 재구성 시도 (DOWNLOAD_DIR 사용)
      if (!fileInfo.exists && fileName) {
        const reconstructedUri = `${DOWNLOAD_DIR}${fileName}`;
        if (reconstructedUri !== fileUri && !reconstructedUri.includes(fileUri) && !fileUri.includes(reconstructedUri)) {
          console.log('[DownloadService] Trying reconstructed URI from fileName:', reconstructedUri);
          fileInfo = await FileSystem.getInfoAsync(reconstructedUri);
          if (fileInfo.exists) {
            fileUri = reconstructedUri;
            console.log('[DownloadService] ✅ File found with reconstructed URI');
          }
        }
      }
      
      // 5. URI에서 파일명 추출하여 재구성 시도 (실제 파일명과 다를 수 있음)
      if (!fileInfo.exists && fileUri.includes('/')) {
        const uriParts = fileUri.split('/');
        const uriFileName = uriParts[uriParts.length - 1];
        if (uriFileName && uriFileName.includes('.') && uriFileName !== fileName) {
          // URL 디코딩된 파일명도 시도
          let decodedFileName = uriFileName;
          try {
            decodedFileName = decodeURIComponent(uriFileName);
          } catch (e) {
            // 디코딩 실패해도 원본 사용
          }
          
          const altUri = `${DOWNLOAD_DIR}${decodedFileName}`;
          if (altUri !== fileUri && altUri !== `${DOWNLOAD_DIR}${fileName}`) {
            console.log('[DownloadService] Trying alternative URI from path:', altUri);
            fileInfo = await FileSystem.getInfoAsync(altUri);
            if (fileInfo.exists) {
              fileUri = altUri;
              fileName = decodedFileName; // 파일명도 업데이트
              console.log('[DownloadService] ✅ File found with alternative URI from path');
            }
          }
        }
      }
      
      // 6. file:// 프로토콜을 제거한 상태로 재구성 시도
      if (!fileInfo.exists && fileName) {
        let cleanUri = fileUri;
        if (cleanUri.startsWith('file://')) {
          cleanUri = cleanUri.replace('file://', '');
        }
        const cleanFileName = fileName;
        const cleanReconstructedUri = `${DOWNLOAD_DIR}${cleanFileName}`;
        
        if (cleanReconstructedUri !== cleanUri) {
          console.log('[DownloadService] Trying clean reconstructed URI:', cleanReconstructedUri);
          fileInfo = await FileSystem.getInfoAsync(cleanReconstructedUri);
          if (fileInfo.exists) {
            fileUri = cleanReconstructedUri;
            console.log('[DownloadService] ✅ File found with clean reconstructed URI');
          }
        }
      }
    }
    
    console.log('[DownloadService] File info:', {
      exists: fileInfo.exists,
      size: fileInfo.size,
      uri: fileInfo.uri,
      isDirectory: fileInfo.isDirectory,
      finalUri: fileUri
    });
    
    if (!fileInfo.exists) {
      console.error('[DownloadService] ❌ File does not exist after all attempts!');
      console.error('[DownloadService] Tried URI:', fileUri);
      console.error('[DownloadService] File name:', fileName);
      throw new Error(`Source file does not exist: ${fileUri}\n\n파일이 삭제되었거나 다운로드가 완료되지 않았을 수 있습니다.\n공유하기 버튼을 사용하여 수동으로 저장해주세요.`);
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
          
          // ✅ 위에서 찾은 실제 fileUri를 기반으로 정규화
          // FileSystem.getInfoAsync가 반환한 실제 URI를 우선 사용 (가장 정확함)
          let normalizedFileUri = fileInfo.uri || fileUri;
          
          // file:// 프로토콜 제거 (네이티브 모듈은 절대 경로를 원함)
          if (normalizedFileUri.startsWith('file://')) {
            normalizedFileUri = normalizedFileUri.replace('file://', '');
          }
          
          // ✅ 파일명에 특수문자가 포함된 경우를 대비하여 경로 재구성 시도
          // fileInfo.uri가 실제 파일 경로와 다를 수 있으므로, fileUri도 확인
          if (fileInfo.uri !== fileUri) {
            console.log('[DownloadService] fileInfo.uri differs from fileUri, using fileInfo.uri:', fileInfo.uri);
          }
          
          // URL 인코딩된 문자 디코딩 시도 (파일명에 특수문자가 있을 수 있음)
          // 하지만 이미 파일을 찾았으므로, 정규화된 경로는 그대로 사용
          // decodeURIComponent는 파일명이 URL 인코딩되어 있는 경우에만 필요
          try {
            // 경로의 마지막 부분(파일명)만 디코딩 시도 (이미 정상 경로일 수 있음)
            const pathParts = normalizedFileUri.split('/');
            const fileNamePart = pathParts[pathParts.length - 1];
            
            // 파일명이 URL 인코딩되어 있는지 확인 (%가 포함되어 있는지)
            if (fileNamePart.includes('%')) {
              try {
                const decodedFileNamePart = decodeURIComponent(fileNamePart);
                if (decodedFileNamePart !== fileNamePart) {
                  pathParts[pathParts.length - 1] = decodedFileNamePart;
                  const decodedPath = pathParts.join('/');
                  // 디코딩된 경로로 파일 존재 확인
                  const decodedFileInfo = await FileSystem.getInfoAsync(decodedPath);
                  if (decodedFileInfo.exists) {
                    normalizedFileUri = decodedPath;
                    console.log('[DownloadService] Using decoded file path:', decodedFileNamePart);
                  }
                }
              } catch (e) {
                console.warn('[DownloadService] Could not decode file name, using original:', e);
              }
            }
          } catch (e) {
            console.warn('[DownloadService] Could not process URI, using original:', e);
          }
          
          // 파일명 디코딩 (URL 인코딩된 경우)
          let decodedFileName = fileName;
          try {
            decodedFileName = decodeURIComponent(fileName);
          } catch (e) {
            console.warn('[DownloadService] Could not decode file name, using original:', e);
            decodedFileName = fileName;
          }
          
          // 파일 정보는 이미 위에서 확인했으므로 그대로 사용
          const finalFileInfo = fileInfo;
          
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
      // 파일이 실제로 존재하는지 먼저 확인
      let fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        // 디코딩된 URI로도 확인 시도
        try {
          const decodedUri = decodeURIComponent(fileUri);
          const decodedFileInfo = await FileSystem.getInfoAsync(decodedUri);
          if (decodedFileInfo.exists) {
            fileUri = decodedUri;
            fileInfo = decodedFileInfo;
            console.log('[DownloadService] Using decoded URI:', fileUri);
          }
        } catch (e) {
          console.warn('[DownloadService] Could not decode URI:', e);
        }
      }
      
      // URI에서 실제 파일명 추출 (가장 정확한 방법)
      let actualFileName = fileName;
      try {
        const uriParts = fileUri.split('/');
        let uriFileName = uriParts[uriParts.length - 1];
        
        // URL 디코딩 시도
        try {
          uriFileName = decodeURIComponent(uriFileName);
        } catch (e) {
          // 디코딩 실패해도 원본 사용
        }
        
        console.log('[DownloadService] Filename from URI (raw):', uriFileName);
        console.log('[DownloadService] Filename from param:', fileName);
        
        // URI에서 추출한 파일명이 유효하면 우선 사용
        if (uriFileName && uriFileName.includes('.')) {
          // 파일명이 유효한지 확인 (특수문자만 있거나 너무 짧으면 무시)
          if (uriFileName.length > 3 && 
              uriFileName !== '[' && 
              !uriFileName.match(/^[_\-\.\[\]]+$/)) {
            actualFileName = uriFileName;
            console.log('[DownloadService] Using valid filename from URI:', actualFileName);
          } else {
            console.warn('[DownloadService] Filename from URI is invalid:', uriFileName);
          }
        }
        
        // 파라미터로 받은 파일명이 유효하지 않으면 URI에서 추출한 것 사용
        if (!actualFileName || 
            actualFileName.length < 3 || 
            actualFileName === '[' || 
            actualFileName.match(/^[_\-\.\[\]]+$/)) {
          if (uriFileName && uriFileName.includes('.')) {
            actualFileName = uriFileName;
            console.log('[DownloadService] Using filename from URI (fallback):', actualFileName);
          } else {
            // 최후의 수단: 기본 파일명 사용
            actualFileName = isVideo ? 'video.mp4' : 'audio.m4a';
            console.warn('[DownloadService] Using default filename:', actualFileName);
          }
        }
      } catch (e) {
        console.warn('[DownloadService] Could not extract filename from URI:', e);
        // 기본 파일명 사용
        if (!actualFileName || actualFileName.length < 3) {
          actualFileName = isVideo ? 'video.mp4' : 'audio.m4a';
        }
      }
      
      // 확장자가 없는 경우 추가
      if (!actualFileName.includes('.')) {
        actualFileName = isVideo ? `${actualFileName}.mp4` : `${actualFileName}.m4a`;
        console.log('[DownloadService] Added extension to filename:', actualFileName);
      }
      
      // 최종 파일명 검증 및 정리
      if (actualFileName === '[' || actualFileName.match(/^[_\-\.\[\]]+$/)) {
        console.error('[DownloadService] Filename is still invalid, using default');
        actualFileName = isVideo ? 'video.mp4' : 'audio.m4a';
      }
      
      // 파일 확장자로 MIME 타입 결정 (더 정확하게)
      const fileExtension = actualFileName?.split('.').pop()?.toLowerCase();
      let mimeType = 'application/octet-stream';
      
      // 확장자를 우선적으로 확인하여 MIME 타입 결정
      // 확장자가 명확하면 확장자 기준, 아니면 isVideo 파라미터 사용
      if (fileExtension === 'mp4') {
        // .mp4는 비디오 파일이므로 video/mp4
        mimeType = 'video/mp4';
      } else if (fileExtension === 'm4a') {
        // .m4a는 오디오 파일이므로 audio/mp4
        mimeType = 'audio/mp4';
      } else if (fileExtension === 'mov') {
        mimeType = 'video/quicktime';
      } else if (fileExtension === 'avi') {
        mimeType = 'video/x-msvideo';
      } else if (fileExtension === 'mp3') {
        mimeType = 'audio/mpeg';
      } else if (fileExtension === 'aac') {
        mimeType = 'audio/aac';
      } else if (fileExtension === 'wav') {
        mimeType = 'audio/wav';
      } else {
        // 확장자가 없거나 알 수 없으면 isVideo 파라미터 사용
        mimeType = isVideo ? 'video/mp4' : 'audio/mp4';
        console.warn('[DownloadService] Unknown extension, using isVideo parameter:', isVideo);
      }
      
      console.log('[DownloadService] Sharing file with MIME type:', mimeType, 'fileName:', actualFileName);
      console.log('[DownloadService] Original fileName param:', fileName);
      console.log('[DownloadService] Source file URI:', fileUri);
      console.log('[DownloadService] isVideo parameter:', isVideo);
      console.log('[DownloadService] File extension:', fileExtension);
      
      // 파일 크기 확인 (로깅만)
      const fileSizeMB = fileInfo.size ? (fileInfo.size / (1024 * 1024)).toFixed(2) : 0;
      console.log('[DownloadService] File size:', fileSizeMB, 'MB');
      console.log('[DownloadService] File type:', isVideo ? 'video' : 'audio');
      console.log('[DownloadService] MIME type:', mimeType);
      
      // 카카오톡은 300MB까지 파일 공유를 지원하지만, 다른 앱으로 공유할 수 있으므로
      // 경고 없이 공유 시도 (사용자가 원하는 앱을 선택할 수 있도록)
      
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
    console.error('[DownloadService] Error details:', {
      message: error.message,
      code: error.code,
      fileName: fileName,
      fileUri: fileUri,
      isVideo: isVideo
    });
    Alert.alert('오류', `파일 공유 중 오류가 발생했습니다.\n\n${error.message || '알 수 없는 오류'}`);
  }
};

// 내부 저장소의 모든 파일 목록 가져오기 (디버깅/정리용)
export const getAllFilesInStorage = async () => {
  try {
    await ensureDownloadDir();
    const dirInfo = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
    
    if (!dirInfo.exists) {
      return [];
    }
    
    const files = await FileSystem.readDirectoryAsync(DOWNLOAD_DIR);
    const fileList = [];
    
    for (const fileName of files) {
      const fileUri = `${DOWNLOAD_DIR}${fileName}`;
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      
      if (fileInfo.exists && !fileInfo.isDirectory) {
        fileList.push({
          fileName,
          fileUri,
          size: fileInfo.size,
          modificationTime: fileInfo.modificationTime || Date.now(),
        });
      }
    }
    
    return fileList;
  } catch (error) {
    console.error('[DownloadService] Error getting all files:', error);
    return [];
  }
};

// 특정 파일 삭제 (파일명으로)
export const deleteFileByName = async (fileName) => {
  try {
    const fileUri = `${DOWNLOAD_DIR}${fileName}`;
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
    console.log('[DownloadService] File deleted:', fileName);
    return true;
  } catch (error) {
    console.error('[DownloadService] Error deleting file:', error);
    return false;
  }
};

// 내부 저장소의 모든 파일 삭제 (정리용)
export const clearAllDownloadedFiles = async () => {
  try {
    const files = await getAllFilesInStorage();
    let deletedCount = 0;
    
    for (const file of files) {
      try {
        await FileSystem.deleteAsync(file.fileUri, { idempotent: true });
        deletedCount++;
      } catch (error) {
        console.warn('[DownloadService] Could not delete file:', file.fileName, error);
      }
    }
    
    console.log('[DownloadService] Deleted', deletedCount, 'files');
    return deletedCount;
  } catch (error) {
    console.error('[DownloadService] Error clearing files:', error);
    throw error;
  }
};

// 불완전한 파일 정리 (크기가 기준치 이하인 파일 삭제)
export const cleanupIncompleteFiles = async () => {
  try {
    await ensureDownloadDir();
    const files = await getAllFilesInStorage();
    let deletedCount = 0;
    
    console.log('[DownloadService] Cleaning up incomplete files...');
    
    for (const file of files) {
      try {
        // 비디오 파일: 1MB 미만은 불완전한 파일로 간주
        // 오디오 파일: 100KB 미만은 불완전한 파일로 간주
        const isVideo = file.fileName.endsWith('.mp4') || file.fileName.endsWith('.mov') || file.fileName.endsWith('.avi');
        const isAudio = file.fileName.endsWith('.m4a') || file.fileName.endsWith('.mp3');
        const minSize = isVideo ? 1024 * 1024 : isAudio ? 100 * 1024 : 1024 * 1024; // 기본값 1MB
        
        if (file.size < minSize) {
          console.log('[DownloadService] Deleting incomplete file:', file.fileName, `(${(file.size / 1024).toFixed(2)} KB)`);
          await FileSystem.deleteAsync(file.fileUri, { idempotent: true });
          deletedCount++;
        }
      } catch (error) {
        console.warn('[DownloadService] Could not delete incomplete file:', file.fileName, error);
      }
    }
    
    if (deletedCount > 0) {
      console.log('[DownloadService] Cleaned up', deletedCount, 'incomplete files');
    } else {
      console.log('[DownloadService] No incomplete files found');
    }
    
    return deletedCount;
  } catch (error) {
    console.error('[DownloadService] Error cleaning up incomplete files:', error);
    return 0;
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
    
    // ✅ 메타데이터 읽기
    const metadata = await getMetadata();
    
    // 디렉토리 내용 읽기
    const files = await FileSystem.readDirectoryAsync(DOWNLOAD_DIR);
    
    const fileList = [];
    for (const fileName of files) {
      const fileUri = `${DOWNLOAD_DIR}${fileName}`;
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      
      if (fileInfo.exists && !fileInfo.isDirectory && fileInfo.size > 0) {
        // 파일 확장자 추출 (더 정확한 방법)
        // 마지막 점 이후를 확장자로 추출 (파일명에 점이 여러 개 있을 수 있음)
        const lastDotIndex = fileName.lastIndexOf('.');
        let extension = '';
        let baseFileName = fileName;
        
        if (lastDotIndex > 0 && lastDotIndex < fileName.length - 1) {
          extension = fileName.substring(lastDotIndex + 1).toLowerCase();
          baseFileName = fileName.substring(0, lastDotIndex);
        }
        
        const isVideo = extension === 'mp4' || extension === 'mov' || extension === 'avi' || extension === 'mkv';
        const isAudio = extension === 'm4a' || extension === 'mp3' || extension === 'aac' || extension === 'wav';
        
        // 파일명에서 제목 추출 (확장자 제거)
        // 기존 파일명에 `[`나 특수문자가 포함되어 있어도 제목으로 표시
        let title = baseFileName;
        
        // 제목이 비어있거나 너무 짧으면 파일명 그대로 사용
        if (!title || title.length < 1) {
          title = fileName;
        }
        
        // 제목이 너무 짧거나 특수문자만 있으면 기본값 사용
        // `[` 하나만 있거나 특수문자만 있는 경우 처리
        if (title.length < 2 || title.match(/^[_\-\.\[\]]+$/) || title === '[') {
          console.warn('[DownloadService] Title is too short or only special chars, using default:', title);
          title = extension === 'mp4' ? 'Video' : extension === 'm4a' ? 'Audio' : 'File';
        } else {
          // 언더스코어를 공백으로 변환하여 가독성 향상
          // 기존 파일명에 `[`가 포함되어 있으면 언더스코어로 변환된 상태이므로 그대로 표시
          title = title.replace(/_/g, ' ');
          
          // 제목이 여전히 비어있거나 너무 짧으면 기본값 사용
          if (!title || title.trim().length < 1) {
            console.warn('[DownloadService] Title is empty after processing, using default');
            title = extension === 'mp4' ? 'Video' : extension === 'm4a' ? 'Audio' : 'File';
          }
        }
        
        // 파일명이 `[`로 시작하거나 특수문자가 많아도 파일은 표시되어야 하므로
        // 제목이 비어있지 않으면 그대로 사용
        
        // 디버깅 로그
        console.log('[DownloadService] File processing:', {
          fileName: fileName,
          baseFileName: baseFileName,
          extension: extension,
          extractedTitle: title,
          isVideo: isVideo,
          isAudio: isAudio
        });
        
        // 파일 타입 판단: 확장자가 명확하지 않으면 크기로 추정
        // 영상은 일반적으로 음악보다 큼 (100MB 이상이면 영상일 가능성 높음)
        let finalIsVideo = isVideo;
        if (!isVideo && !isAudio) {
          // 확장자가 없거나 알 수 없는 경우 크기로 추정
          finalIsVideo = fileInfo.size > 100 * 1024 * 1024; // 100MB 이상이면 영상으로 간주
        } else if (isVideo) {
          finalIsVideo = true;
        } else {
          finalIsVideo = false;
        }
        
        // ✅ 메타데이터에서 videoId와 thumbnailUrl 가져오기
        const fileMetadata = metadata[fileName] || {};
        const fileData = {
          fileName,
          fileUri,
          title,
          size: fileInfo.size,
          isVideo: finalIsVideo,
          modifiedTime: fileInfo.modificationTime || Date.now(),
          videoId: fileMetadata.videoId || null,
          thumbnailUrl: fileMetadata.thumbnailUrl || null,
        };
        
        fileList.push(fileData);
      }
    }
    
    // 최신순으로 정렬
    fileList.sort((a, b) => b.modifiedTime - a.modifiedTime);
    
    // ✅ 존재하지 않는 파일의 메타데이터 정리
    const existingFileNames = new Set(fileList.map(f => f.fileName));
    let metadataUpdated = false;
    for (const fileName in metadata) {
      if (!existingFileNames.has(fileName)) {
        delete metadata[fileName];
        metadataUpdated = true;
      }
    }
    if (metadataUpdated) {
      await saveMetadata(metadata);
    }
    
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

// ========== 썸네일 캐시 관리 함수 ==========

// 메타데이터 읽기
const getMetadata = async () => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(METADATA_FILE);
    if (fileInfo.exists) {
      const content = await FileSystem.readAsStringAsync(METADATA_FILE);
      return JSON.parse(content);
    }
    return {};
  } catch (error) {
    console.error('[DownloadService] Error reading metadata:', error);
    return {};
  }
};

// 메타데이터 저장
const saveMetadata = async (metadata) => {
  try {
    await FileSystem.writeAsStringAsync(METADATA_FILE, JSON.stringify(metadata, null, 2));
  } catch (error) {
    console.error('[DownloadService] Error saving metadata:', error);
  }
};

// 썸네일 다운로드 및 캐시 저장
export const downloadThumbnail = async (videoId, thumbnailUrl) => {
  try {
    await ensureThumbnailCacheDir();
    
    if (!thumbnailUrl || !videoId) {
      console.warn('[DownloadService] No thumbnail URL or videoId provided:', { videoId, thumbnailUrl });
      return null;
    }
    
    const thumbnailPath = `${THUMBNAIL_CACHE_DIR}${videoId}.jpg`;
    
    // 이미 캐시가 있으면 스킵
    const existingCache = await FileSystem.getInfoAsync(thumbnailPath);
    if (existingCache.exists) {
      console.log('[DownloadService] Thumbnail cache already exists:', videoId);
      return thumbnailPath;
    }
    
    console.log('[DownloadService] Downloading thumbnail:', thumbnailUrl, 'to:', thumbnailPath);
    
    // 썸네일 다운로드
    const downloadResult = await FileSystem.downloadAsync(thumbnailUrl, thumbnailPath);
    
    if (downloadResult.status === 200) {
      console.log('[DownloadService] Thumbnail cached successfully:', videoId);
      return thumbnailPath;
    } else {
      console.warn('[DownloadService] Failed to download thumbnail, status:', downloadResult.status);
      return null;
    }
  } catch (error) {
    console.error('[DownloadService] Error downloading thumbnail:', error);
    return null;
  }
};

// 썸네일 캐시 경로 가져오기 (없으면 null)
export const getThumbnailCachePath = async (videoId) => {
  try {
    if (!videoId) return null;
    const thumbnailPath = `${THUMBNAIL_CACHE_DIR}${videoId}.jpg`;
    const fileInfo = await FileSystem.getInfoAsync(thumbnailPath);
    if (fileInfo.exists) {
      return thumbnailPath;
    }
    return null;
  } catch (error) {
    console.error('[DownloadService] Error getting thumbnail cache path:', error);
    return null;
  }
};

// 썸네일 캐시 삭제 (옵션 2: 스마트 삭제 - 찜하기와 다운로드 파일 둘 다 없을 때만 삭제)
export const deleteThumbnailCacheIfUnused = async (videoId) => {
  try {
    if (!videoId) return false;
    
    // 찜하기에 있는지 확인
    const { isFavorite } = await import('./database');
    const hasFavorite = await isFavorite(videoId);
    
    // 다운로드 파일에 있는지 확인
    const downloadedFiles = await getDownloadedFiles();
    const metadata = await getMetadata();
    const hasDownloadedFile = downloadedFiles.some(file => {
      const fileMetadata = metadata[file.fileName];
      return fileMetadata && fileMetadata.videoId === videoId;
    });
    
    // 둘 다 없을 때만 삭제
    if (!hasFavorite && !hasDownloadedFile) {
      const thumbnailPath = `${THUMBNAIL_CACHE_DIR}${videoId}.jpg`;
      const fileInfo = await FileSystem.getInfoAsync(thumbnailPath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(thumbnailPath, { idempotent: true });
        console.log('[DownloadService] Thumbnail cache deleted (unused):', videoId);
        return true;
      }
    } else {
      console.log('[DownloadService] Thumbnail cache kept (in use):', videoId, {
        hasFavorite,
        hasDownloadedFile
      });
    }
    return false;
  } catch (error) {
    console.error('[DownloadService] Error deleting thumbnail cache:', error);
    return false;
  }
};

// 파일 삭제 시 메타데이터 정리 및 썸네일 캐시 스마트 삭제
export const deleteFileWithMetadata = async (fileName, videoId = null) => {
  try {
    // 메타데이터에서 videoId 찾기 (파라미터로 전달되지 않은 경우)
    if (!videoId) {
      const metadata = await getMetadata();
      const fileMetadata = metadata[fileName];
      if (fileMetadata && fileMetadata.videoId) {
        videoId = fileMetadata.videoId;
      }
    }
    
    // 메타데이터에서 해당 파일 정보 삭제
    const metadata = await getMetadata();
    if (metadata[fileName]) {
      delete metadata[fileName];
      await saveMetadata(metadata);
      console.log('[DownloadService] Metadata deleted for file:', fileName);
    }
    
    // videoId가 있으면 썸네일 캐시 스마트 삭제 시도
    if (videoId) {
      await deleteThumbnailCacheIfUnused(videoId);
    }
    
    return true;
  } catch (error) {
    console.error('[DownloadService] Error deleting file metadata:', error);
    return false;
  }
};

