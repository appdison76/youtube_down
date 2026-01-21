import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

// 전체 미디어 파일 개수 확인 (모든 페이지 순회)
export const getLocalFilesCount = async () => {
  try {
    if (Platform.OS !== 'android') {
      return { audio: 0, video: 0, total: 0 };
    }

    const { status } = await MediaLibrary.getPermissionsAsync();
    if (status !== 'granted') {
      return { audio: 0, video: 0, total: 0 };
    }

    // 각 타입별로 모든 페이지를 순회하여 전체 개수 확인
    let audioCount = 0;
    let videoCount = 0;
    let audioCursor = null;
    let videoCursor = null;
    let audioHasMore = true;
    let videoHasMore = true;

    // Audio 파일 개수 확인
    while (audioHasMore) {
      const audioResult = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.audio,
        first: 1000, // 한 번에 1000개씩 가져오기
        after: audioCursor,
        sortBy: MediaLibrary.SortBy.modificationTime,
      });
      audioCount += audioResult.assets.length;
      audioHasMore = audioResult.hasNextPage;
      audioCursor = audioResult.endCursor;
      console.log('[localFileService] Audio count so far:', audioCount, 'hasMore:', audioHasMore);
    }

    // Video 파일 개수 확인
    while (videoHasMore) {
      const videoResult = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.video,
        first: 1000, // 한 번에 1000개씩 가져오기
        after: videoCursor,
        sortBy: MediaLibrary.SortBy.modificationTime,
      });
      videoCount += videoResult.assets.length;
      videoHasMore = videoResult.hasNextPage;
      videoCursor = videoResult.endCursor;
      console.log('[localFileService] Video count so far:', videoCount, 'hasMore:', videoHasMore);
    }

    const totalCount = audioCount + videoCount;

    console.log('[localFileService] Total files count (all pages):', {
      audio: audioCount,
      video: videoCount,
      total: totalCount,
    });

    return {
      audio: audioCount,
      video: videoCount,
      total: totalCount,
      audioHasNext: false,
      videoHasNext: false,
    };
  } catch (error) {
    console.error('[localFileService] Error getting files count:', error);
    return { audio: 0, video: 0, total: 0 };
  }
};

// 로컬 음악 파일 가져오기 (페이지네이션 지원)
export const getLocalAudioFiles = async (options = {}) => {
  try {
    if (Platform.OS !== 'android') {
      console.log('[localFileService] Not Android, returning empty array');
      return { files: [], hasNextPage: false, endCursor: null };
    }

    const { status } = await MediaLibrary.getPermissionsAsync();
    if (status !== 'granted') {
      // 권한이 없으면 조용히 빈 배열 반환 (권한 요청 다이얼로그 표시 안 함)
      console.warn('[localFileService] Media library permission not granted, status:', status);
      return { files: [], hasNextPage: false, endCursor: null };
    }
    console.log('[localFileService] Media library permission granted');

    const {
      first = 50, // 기본 50개
      after = null, // 다음 페이지 커서
      mediaType = MediaLibrary.MediaType.audio, // 기본은 오디오만
    } = options;

    const result = await MediaLibrary.getAssetsAsync({
      mediaType,
      first,
      after,
      sortBy: MediaLibrary.SortBy.modificationTime,
    });

    const files = await Promise.all(result.assets.map(async (asset) => {
      const fileName = asset.filename;
      const isVideo = asset.mediaType === MediaLibrary.MediaType.video;
      const isAudio = asset.mediaType === MediaLibrary.MediaType.audio;

      const title = fileName.includes('.')
        ? fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ')
        : fileName.replace(/_/g, ' ');

      // 항상 MediaLibrary.getAssetInfoAsync를 호출하여 content:// URI 획득
      let fileUri = asset.uri;
      try {
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
        // content:// URI 우선 사용
        if (assetInfo.uri && assetInfo.uri.startsWith('content://')) {
          fileUri = assetInfo.uri;
        } else if (assetInfo.localUri && assetInfo.localUri.startsWith('content://')) {
          fileUri = assetInfo.localUri;
        } else if (asset.uri && asset.uri.startsWith('content://')) {
          fileUri = asset.uri;
        } else {
          // file:// URI인 경우 MediaStore URI 직접 구성
          // asset.id는 MediaStore의 _id와 같음
          if (asset.id) {
            if (isVideo) {
              fileUri = `content://media/external/video/media/${asset.id}`;
            } else if (isAudio) {
              fileUri = `content://media/external/audio/media/${asset.id}`;
            } else {
              fileUri = `content://media/external/file/${asset.id}`;
            }
            console.log(`[localFileService] Constructed MediaStore URI for asset ${asset.id}: ${fileUri}`);
          } else {
            console.warn(`[localFileService] No content:// URI found and no asset.id for asset, using asset.uri: ${asset.uri}`);
          }
        }
      } catch (error) {
        console.warn(`[localFileService] Failed to get asset info for ${asset.id}, trying to construct MediaStore URI:`, error);
        // 오류 발생 시 MediaStore URI 직접 구성 시도
        if (asset.id) {
          if (isVideo) {
            fileUri = `content://media/external/video/media/${asset.id}`;
          } else if (isAudio) {
            fileUri = `content://media/external/audio/media/${asset.id}`;
          } else {
            fileUri = `content://media/external/file/${asset.id}`;
          }
          console.log(`[localFileService] Constructed MediaStore URI (fallback) for asset ${asset.id}: ${fileUri}`);
        } else if (asset.uri && asset.uri.startsWith('content://')) {
          // 이미 content:// URI면 그대로 사용
          fileUri = asset.uri;
        } else {
          console.warn(`[localFileService] Cannot construct MediaStore URI, using asset.uri: ${asset.uri}`);
        }
      }

      return {
        fileUri,
        fileName,
        title,
        size: asset.fileSize || 0,
        isVideo,
        isAudio,
        source: 'local',
        id: asset.id,
        thumbnail: null,
        author: null,
        downloadedAt: asset.modificationTime * 1000,
        duration: asset.duration || 0,
      };
    }));

    return {
      files,
      hasNextPage: result.hasNextPage,
      endCursor: result.endCursor,
    };
  } catch (error) {
    console.error('[localFileService] Error getting local files:', error);
    return { files: [], hasNextPage: false, endCursor: null };
  }
};

export const getLocalVideoFiles = async (options = {}) => {
  return getLocalAudioFiles({
    ...options,
    mediaType: MediaLibrary.MediaType.video,
  });
};

export const getLocalAllFiles = async (options = {}) => {
  try {
    if (Platform.OS !== 'android') {
      console.log('[localFileService] Not Android, returning empty array');
      return { files: [], hasNextPage: false, endCursor: null };
    }

    const { status } = await MediaLibrary.getPermissionsAsync();
    if (status !== 'granted') {
      // 권한이 없으면 조용히 빈 배열 반환 (권한 요청 다이얼로그 표시 안 함)
      console.warn('[localFileService] Media library permission not granted, status:', status);
      return { files: [], hasNextPage: false, endCursor: null };
    }
    console.log('[localFileService] Media library permission granted');

    const {
      first = 50,
      after = null,
    } = options;

    // 각 타입별로 first만큼 가져오기 (합쳐서 정렬 후 필요한 만큼만 반환)
    // 이렇게 하면 audio/video 비율이 맞지 않아도 정확한 개수를 가져올 수 있음
    const fetchSize = first; // first만큼만 가져오기

    // MediaLibrary.getAssetsAsync는 기본적으로 MediaStore에 등록된 모든 미디어를 가져옵니다
    // album 파라미터를 지정하지 않으면 모든 앨범의 파일을 가져옵니다
    // 하지만 일부 파일(특히 카메라로 찍은 영상)이 MediaStore에 등록되지 않았을 수 있습니다
    const [audioResult, videoResult] = await Promise.all([
      MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.audio,
        first: fetchSize,
        after: after?.audio || null,
        sortBy: MediaLibrary.SortBy.modificationTime,
        // album을 지정하지 않으면 모든 앨범의 파일을 가져옵니다
      }),
      MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.video,
        first: fetchSize,
        after: after?.video || null,
        sortBy: MediaLibrary.SortBy.modificationTime,
        // album을 지정하지 않으면 모든 앨범의 파일을 가져옵니다
      }),
    ]);
    
    console.log('[localFileService] getLocalAllFiles fetched:', {
      audio: audioResult.assets.length,
      video: videoResult.assets.length,
      audioHasNext: audioResult.hasNextPage,
      videoHasNext: videoResult.hasNextPage,
    });

    // 모든 asset 합치기
    const allAssets = [
      ...audioResult.assets.map(a => ({ ...a, mediaType: MediaLibrary.MediaType.audio })),
      ...videoResult.assets.map(a => ({ ...a, mediaType: MediaLibrary.MediaType.video })),
    ].sort((a, b) => (b.modificationTime || 0) - (a.modificationTime || 0));

    // first 개수만큼만 반환
    const selectedAssets = allAssets.slice(0, first);

    const files = await Promise.all(selectedAssets.map(async (asset) => {
      const fileName = asset.filename;
      const isVideo = asset.mediaType === MediaLibrary.MediaType.video;
      const isAudio = asset.mediaType === MediaLibrary.MediaType.audio;

      const title = fileName.includes('.')
        ? fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ')
        : fileName.replace(/_/g, ' ');

      // 항상 MediaLibrary.getAssetInfoAsync를 호출하여 content:// URI 획득
      let fileUri = asset.uri;
      try {
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
        // content:// URI 우선 사용
        if (assetInfo.uri && assetInfo.uri.startsWith('content://')) {
          fileUri = assetInfo.uri;
        } else if (assetInfo.localUri && assetInfo.localUri.startsWith('content://')) {
          fileUri = assetInfo.localUri;
        } else if (asset.uri && asset.uri.startsWith('content://')) {
          fileUri = asset.uri;
        } else {
          // file:// URI인 경우 MediaStore URI 직접 구성
          // asset.id는 MediaStore의 _id와 같음
          if (asset.id) {
            if (isVideo) {
              fileUri = `content://media/external/video/media/${asset.id}`;
            } else if (isAudio) {
              fileUri = `content://media/external/audio/media/${asset.id}`;
            } else {
              fileUri = `content://media/external/file/${asset.id}`;
            }
            console.log(`[localFileService] Constructed MediaStore URI for asset ${asset.id}: ${fileUri}`);
          } else {
            console.warn(`[localFileService] No content:// URI found and no asset.id for asset, using asset.uri: ${asset.uri}`);
          }
        }
      } catch (error) {
        console.warn(`[localFileService] Failed to get asset info for ${asset.id}, trying to construct MediaStore URI:`, error);
        // 오류 발생 시 MediaStore URI 직접 구성 시도
        if (asset.id) {
          if (isVideo) {
            fileUri = `content://media/external/video/media/${asset.id}`;
          } else if (isAudio) {
            fileUri = `content://media/external/audio/media/${asset.id}`;
          } else {
            fileUri = `content://media/external/file/${asset.id}`;
          }
          console.log(`[localFileService] Constructed MediaStore URI (fallback) for asset ${asset.id}: ${fileUri}`);
        } else if (asset.uri && asset.uri.startsWith('content://')) {
          // 이미 content:// URI면 그대로 사용
          fileUri = asset.uri;
        } else {
          console.warn(`[localFileService] Cannot construct MediaStore URI, using asset.uri: ${asset.uri}`);
        }
      }

      return {
        fileUri,
        fileName,
        title,
        size: asset.fileSize || 0,
        isVideo,
        isAudio,
        source: 'local',
        id: asset.id,
        thumbnail: null,
        author: null,
        downloadedAt: asset.modificationTime * 1000,
        duration: asset.duration || 0,
      };
    }));

    // 다음 페이지가 있는지 확인
    // 각 타입별로 hasNextPage가 있으면 다음 페이지가 있음
    // 또는 selectedAssets.length가 first와 같고, 각 타입별로 더 가져올 수 있으면 다음 페이지가 있음
    const hasNextPage = audioResult.hasNextPage || videoResult.hasNextPage;
    
    console.log('[localFileService] getLocalAllFiles result:', {
      requested: first,
      fetched: {
        audio: audioResult.assets.length,
        video: videoResult.assets.length,
        total: allAssets.length,
      },
      returned: files.length,
      hasNextPage,
      audioHasNext: audioResult.hasNextPage,
      videoHasNext: videoResult.hasNextPage,
      after: after ? 'provided' : 'null',
    });

    return {
      files,
      hasNextPage,
      endCursor: {
        audio: audioResult.endCursor,
        video: videoResult.endCursor,
      },
    };
  } catch (error) {
    console.error('[localFileService] Error getting local all files:', error);
    return { files: [], hasNextPage: false, endCursor: null };
  }
};

export const deleteLocalFile = async (assetId) => {
  try {
    if (Platform.OS !== 'android') {
      throw new Error('Delete is only supported on Android');
    }

    const { status } = await MediaLibrary.getPermissionsAsync();
    if (status !== 'granted') {
      // 권한이 없으면 에러 반환 (권한 요청 다이얼로그 표시 안 함)
      throw new Error('Media library permission not granted');
    }

    await MediaLibrary.deleteAssetsAsync([assetId]);
    console.log('[localFileService] File deleted:', assetId);
    return true;
  } catch (error) {
    console.error('[localFileService] Error deleting file:', error);
    throw error;
  }
};

