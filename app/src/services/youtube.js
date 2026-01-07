import axios from 'axios';

// YouTube 검색을 위한 설정
// YouTube Data API v3를 사용하려면 API 키가 필요합니다
// 또는 무료 대안으로 youtube-search-api 같은 패키지를 사용할 수 있습니다

import Constants from 'expo-constants';

const YOUTUBE_API_KEY = 
  process.env.EXPO_PUBLIC_YOUTUBE_API_KEY || 
  Constants.expoConfig?.extra?.youtubeApiKey || 
  '';

// YouTube Data API v3를 사용한 검색
export const searchVideos = async (query) => {
  try {
    if (!YOUTUBE_API_KEY) {
      // API 키가 없으면 간단한 검색 시도 (제한적)
      return await searchVideosSimple(query);
    }

    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/search`,
      {
        params: {
          part: 'snippet',
          q: query,
          type: 'video',
          maxResults: 20,
          key: YOUTUBE_API_KEY,
        },
      }
    );

    return formatSearchResults(response.data.items);
  } catch (error) {
    console.error('Search error:', error);
    // API 키가 없거나 오류가 발생하면 간단한 검색 시도
    return await searchVideosSimple(query);
  }
};

// 간단한 검색 (YouTube Data API 없이)
// 실제로는 제한적이지만, 기본적인 검색은 가능합니다
const searchVideosSimple = async (query) => {
  try {
    // YouTube 검색 페이지를 파싱하는 방법 (제한적)
    // 실제 프로덕션에서는 YouTube Data API를 사용하는 것을 권장합니다
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    
    // 여기서는 에러를 반환하고, 사용자에게 API 키 설정을 안내
    throw new Error('YouTube Data API 키가 필요합니다. YouTube Cloud Console에서 API 키를 발급받아 app.json에 설정하세요.');
  } catch (error) {
    throw error;
  }
};

// URL에서 video ID 추출
export const extractVideoId = (url) => {
  if (!url) return null;
  
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  // URL이 아닌 경우 ID로 간주 (11자리)
  if (url.length === 11 && /^[a-zA-Z0-9_-]+$/.test(url)) return url;
  
  return null;
};

// URL이 YouTube 링크인지 확인하고 정보 가져오기
export const getVideoInfoFromUrl = async (url) => {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('유효하지 않은 YouTube URL입니다');
  }

  if (!YOUTUBE_API_KEY) {
    throw new Error('YouTube Data API 키가 필요합니다');
  }

  try {
    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/videos`,
      {
        params: {
          part: 'snippet,contentDetails,statistics',
          id: videoId,
          key: YOUTUBE_API_KEY,
        },
      }
    );

    if (response.data.items.length === 0) {
      throw new Error('영상을 찾을 수 없습니다');
    }

    return formatVideoInfo(response.data.items[0]);
  } catch (error) {
    console.error('Get video info error:', error);
    throw error;
  }
};

// YouTube Data API 응답 포맷팅
const formatSearchResults = (items) => {
  return items.map(item => ({
    id: item.id.videoId,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
    channel: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    description: item.snippet.description,
  }));
};

const formatVideoInfo = (item) => {
  return {
    id: item.id,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
    channel: item.snippet.channelTitle,
    duration: parseDuration(item.contentDetails.duration),
    views: parseInt(item.statistics.viewCount) || 0,
    description: item.snippet.description,
  };
};

// ISO 8601 duration을 읽기 쉬운 형식으로 변환
const parseDuration = (duration) => {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return '';
  
  const hours = (match[1] || '').replace('H', '');
  const minutes = (match[2] || '').replace('M', '');
  const seconds = (match[3] || '').replace('S', '');
  
  const parts = [];
  if (hours) parts.push(hours.padStart(2, '0'));
  parts.push((minutes || '0').padStart(2, '0'));
  parts.push((seconds || '0').padStart(2, '0'));
  
  return parts.join(':');
};
