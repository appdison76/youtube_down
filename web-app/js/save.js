// YouTube URL 저장 기능
const urlInput = document.getElementById('url-input');
const urlSubmitBtn = document.getElementById('url-submit-btn');
const videoInfo = document.getElementById('video-info');
const videoThumbnail = document.getElementById('video-thumbnail');
const videoTitle = document.getElementById('video-title');
const videoAuthor = document.getElementById('video-author');
const downloadVideoBtn = document.getElementById('download-video-btn');
const downloadAudioBtn = document.getElementById('download-audio-btn');
const favoriteBtn = document.getElementById('favorite-btn');

let currentVideoUrl = null;
let currentVideoId = null;

urlSubmitBtn.addEventListener('click', handleUrlSubmit);
urlInput.addEventListener('paste', (e) => {
    setTimeout(() => {
        if (urlInput.value.trim()) {
            handleUrlSubmit();
        }
    }, 100);
});

async function handleUrlSubmit() {
    const url = urlInput.value.trim();
    if (!url) return;
    
    // YouTube URL 추출
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (!videoIdMatch) {
        alert('올바른 YouTube URL을 입력해주세요.');
        return;
    }
    
    currentVideoId = videoIdMatch[1];
    currentVideoUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;
    
    videoInfo.style.display = 'none';
    urlSubmitBtn.textContent = '로딩 중...';
    urlSubmitBtn.disabled = true;
    
    try {
        const info = await getVideoInfo(currentVideoUrl);
        
        videoThumbnail.src = info.thumbnail;
        videoTitle.textContent = info.title;
        videoAuthor.textContent = info.author;
        
        videoInfo.style.display = 'block';
        
        // 찜하기 상태 확인
        const isFavorite = await hasItem(currentVideoId);
        favoriteBtn.textContent = isFavorite ? '찜하기 취소' : '찜하기';
        
    } catch (error) {
        console.error('영상 정보 가져오기 실패:', error);
        alert('영상 정보를 가져오는데 실패했습니다.');
    } finally {
        urlSubmitBtn.textContent = '가져오기';
        urlSubmitBtn.disabled = false;
    }
}

downloadVideoBtn.addEventListener('click', async () => {
    if (!currentVideoUrl) return;
    const btn = downloadVideoBtn;
    const origText = btn.textContent;
    btn.textContent = '다운로드 중...';
    btn.disabled = true;
    try {
        const name = (videoTitle.textContent || 'video').replace(/[<>:"/\\|?*]/g, '_').slice(0, 100) + '.mp4';
        await downloadVideoWithFallback(currentVideoUrl, name);
        addItem({
            id: currentVideoId,
            title: videoTitle.textContent,
            author: videoAuthor.textContent,
            thumbnail: videoThumbnail.src,
            url: currentVideoUrl,
            type: 'downloaded',
            format: 'video',
        });
    } catch (e) {
        console.error('영상 다운로드 실패:', e);
        alert('다운로드에 실패했습니다. ' + (e?.message || ''));
    } finally {
        btn.textContent = origText;
        btn.disabled = false;
    }
});

downloadAudioBtn.addEventListener('click', async () => {
    if (!currentVideoUrl) return;
    const btn = downloadAudioBtn;
    const origText = btn.textContent;
    btn.textContent = '다운로드 중...';
    btn.disabled = true;
    try {
        const name = (videoTitle.textContent || 'audio').replace(/[<>:"/\\|?*]/g, '_').slice(0, 100) + '.m4a';
        await downloadAudioWithFallback(currentVideoUrl, name);
        addItem({
            id: currentVideoId,
            title: videoTitle.textContent,
            author: videoAuthor.textContent,
            thumbnail: videoThumbnail.src,
            url: currentVideoUrl,
            type: 'downloaded',
            format: 'audio',
        });
    } catch (e) {
        console.error('음악 다운로드 실패:', e);
        alert('다운로드에 실패했습니다. ' + (e?.message || ''));
    } finally {
        btn.textContent = origText;
        btn.disabled = false;
    }
});

favoriteBtn.addEventListener('click', async () => {
    if (!currentVideoId) return;
    
    const isFavorite = await hasItem(currentVideoId);
    
    if (isFavorite) {
        await removeItem(currentVideoId);
        favoriteBtn.textContent = '찜하기';
    } else {
        await addItem({
            id: currentVideoId,
            title: videoTitle.textContent,
            author: videoAuthor.textContent,
            thumbnail: videoThumbnail.src,
            url: currentVideoUrl,
            type: 'favorite',
        });
        favoriteBtn.textContent = '찜하기 취소';
    }
});
