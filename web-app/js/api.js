// API 설정
// Railway 서버 URL로 변경 필요
const API_BASE_URL = window.API_BASE_URL || 'https://your-railway-server.railway.app';

// 음악 인식 API
async function recognizeMusic(audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    
    const response = await fetch(`${API_BASE_URL}/api/recognize`, {
        method: 'POST',
        body: formData,
    });
    
    if (!response.ok) {
        throw new Error('음악 인식에 실패했습니다.');
    }
    
    return await response.json();
}

// YouTube 검색 API
async function searchYouTube(query, maxResults = 20) {
    const response = await fetch(`${API_BASE_URL}/api/search`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, maxResults }),
    });
    
    if (!response.ok) {
        throw new Error('검색에 실패했습니다.');
    }
    
    return await response.json();
}

// YouTube 영상 정보 가져오기
async function getVideoInfo(url) {
    const response = await fetch(`${API_BASE_URL}/api/video-info`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
    });
    
    if (!response.ok) {
        throw new Error('영상 정보를 가져오는데 실패했습니다.');
    }
    
    return await response.json();
}

// YouTube 다운로드 (영상)
function downloadVideo(url) {
    return `${API_BASE_URL}/api/download/video?url=${encodeURIComponent(url)}`;
}

// YouTube 다운로드 (음악)
function downloadAudio(url) {
    return `${API_BASE_URL}/api/download/audio?url=${encodeURIComponent(url)}`;
}
