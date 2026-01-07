import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// YouTube 다운로드 기능
// 외부 YouTube 다운로드 API 서비스를 사용하거나
// 간단한 프록시를 통해 다운로드 URL을 가져옵니다

/**
 * YouTube 다운로드 URL 가져오기 (외부 API 사용)
 * 실제 프로덕션에서는 안정적인 YouTube 다운로드 API 서비스를 사용하거나
 * 자체 백엔드 서버를 구축하는 것을 권장합니다
 */
const getYouTubeDownloadUrl = async (videoId, type = 'video') => {
  try {
    // 방법 1: 무료 YouTube 다운로드 API 사용 (예시)
    // 실제로는 안정적인 서비스를 찾아서 사용하거나 자체 서버 구축 필요
    const apiUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // 방법 2: 간단한 프록시 서버 사용 (Flask 서버 활용 가능)
    // const apiUrl = `https://your-server.com/api/youtube/download?video_id=${videoId}&type=${type}`;
    
    // 임시: 실제 구현은 안정적인 YouTube 다운로드 서비스 필요
    // 여기서는 구조만 제공하고, 실제 서비스 연동 필요
    
    throw new Error('YouTube 다운로드 기능을 사용하려면 안정적인 다운로드 서비스가 필요합니다.\n\n옵션:\n1. 자체 Flask 서버 구축 (yt-dlp 사용)\n2. 외부 YouTube 다운로드 API 서비스 사용\n3. react-native-ytdl 같은 패키지 사용');
  } catch (error) {
    console.error('Get download URL error:', error);
    throw error;
  }
};

/**
 * YouTube 영상 다운로드
 */
export const downloadVideo = async (videoId, type = 'video') => {
  try {
    // 다운로드 URL 가져오기
    const downloadUrl = await getYouTubeDownloadUrl(videoId, type);
    
    if (!downloadUrl) {
      throw new Error('다운로드 URL을 찾을 수 없습니다');
    }

    // 파일명 생성
    const extension = type === 'audio' ? 'mp3' : 'mp4';
    const filename = `${videoId}_${Date.now()}.${extension}`;
    const fileUri = FileSystem.documentDirectory + filename;

    // 다운로드 시작
    const downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      fileUri,
      {},
      (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        console.log(`Download progress: ${(progress * 100).toFixed(2)}%`);
      }
    );

    const result = await downloadResumable.downloadAsync();
    
    if (!result) {
      throw new Error('다운로드에 실패했습니다');
    }

    return result.uri;
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
};

/**
 * 파일 다운로드 헬퍼 (일반 URL 다운로드용)
 */
const downloadFile = async (url, filename) => {
  const fileUri = FileSystem.documentDirectory + filename;
  
  const downloadResumable = FileSystem.createDownloadResumable(
    url,
    fileUri
  );

  try {
    const result = await downloadResumable.downloadAsync();
    return result.uri;
  } catch (error) {
    console.error('File download error:', error);
    throw error;
  }
};

// 파일 공유
export const shareFile = async (fileUri) => {
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(fileUri);
    } else {
      throw new Error('공유 기능을 사용할 수 없습니다');
    }
  } catch (error) {
    console.error('Share error:', error);
    throw error;
  }
};

