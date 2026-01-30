// YouTube 검색 기능
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');

searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        performSearch();
    }
});

async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) return;
    
    searchResults.innerHTML = '<p>검색 중...</p>';
    
    try {
        const data = await searchYouTube(query);
        
        if (!data.items || data.items.length === 0) {
            searchResults.innerHTML = '<p>검색 결과가 없습니다.</p>';
            return;
        }
        
        const thumbUrl = (s) => (s && s.thumbnails && (s.thumbnails.medium || s.thumbnails.default)) ? (s.thumbnails.medium || s.thumbnails.default).url : '';
        searchResults.innerHTML = data.items.map(item => {
            const videoId = item.id && item.id.videoId ? item.id.videoId : item.id;
            if (!videoId) return '';
            const url = `https://www.youtube.com/watch?v=${videoId}`;
            const thumb = thumbUrl(item.snippet);
            const title = (item.snippet && item.snippet.title) || '';
            const channel = (item.snippet && item.snippet.channelTitle) || '';
            return `
                <div class="youtube-result-card search-result-card" data-video-id="${videoId}">
                    ${thumb ? `<img src="${thumb}" alt="" class="youtube-card-thumbnail" />` : '<div class="youtube-card-thumbnail placeholder"></div>'}
                    <div class="youtube-card-content">
                        <h4 class="youtube-card-title">${title}</h4>
                        <p class="youtube-card-channel">${channel}</p>
                        <div class="youtube-card-actions">
                            <button type="button" class="card-btn card-btn-favorite" data-video-id="${videoId}" data-title="${(title || '').replace(/"/g, '&quot;')}" data-channel="${(channel || '').replace(/"/g, '&quot;')}" data-thumb="${(thumb || '').replace(/"/g, '&quot;')}" data-url="${url.replace(/"/g, '&quot;')}">⭐ 찜하기</button>
                            <button type="button" class="card-btn card-btn-play" data-url="${url.replace(/"/g, '&quot;')}">▶ 재생</button>
                            <button type="button" class="card-btn card-btn-download-video" data-url="${url.replace(/"/g, '&quot;')}" data-title="${(title || '').replace(/"/g, '&quot;')}">📥 영상</button>
                            <button type="button" class="card-btn card-btn-download-audio" data-url="${url.replace(/"/g, '&quot;')}" data-title="${(title || '').replace(/"/g, '&quot;')}">🎵 음악</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // 버튼 이벤트 (재생 / 다운로드 / 찜하기)
        searchResults.querySelectorAll('.card-btn-play').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); window.open(btn.dataset.url, '_blank'); });
        });
        searchResults.querySelectorAll('.card-btn-download-video').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const url = btn.dataset.url;
                const title = btn.dataset.title || 'video';
                const videoId = url.match(/v=([^&]+)/)?.[1] || '';
                try {
                    const fileName = (sanitizeFileName(title) || 'video') + '.mp4';
                    await downloadVideoWithFallback(url, fileName);
                    if (typeof addItem === 'function') {
                        await addItem({ id: videoId, title, url, thumbnail: '', author: '', type: 'downloaded', format: 'video' });
                    }
                } catch (err) { console.error(err); alert('다운로드에 실패했습니다.'); }
            });
        });
        searchResults.querySelectorAll('.card-btn-download-audio').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const url = btn.dataset.url;
                const title = btn.dataset.title || 'audio';
                const videoId = url.match(/v=([^&]+)/)?.[1] || '';
                try {
                    const fileName = (sanitizeFileName(title) || 'audio') + '.m4a';
                    await downloadAudioWithFallback(url, fileName);
                    if (typeof addItem === 'function') {
                        await addItem({ id: videoId, title, url, thumbnail: '', author: '', type: 'downloaded', format: 'audio' });
                    }
                } catch (err) { console.error(err); alert('다운로드에 실패했습니다.'); }
            });
        });
        searchResults.querySelectorAll('.card-btn-favorite').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const videoId = btn.dataset.videoId;
                const isFav = typeof hasItem === 'function' && (await hasItem(videoId));
                if (isFav && typeof removeItem === 'function') {
                    await removeItem(videoId);
                    btn.textContent = '⭐ 찜하기';
                } else if (typeof addItem === 'function') {
                    await addItem({ id: videoId, title: btn.dataset.title || '', author: btn.dataset.channel || '', thumbnail: btn.dataset.thumb || '', url: btn.dataset.url || '', type: 'favorite' });
                    btn.textContent = '❤️ 찜 취소';
                }
            });
        });
        
    } catch (error) {
        console.error('검색 실패:', error);
        searchResults.innerHTML = '<p>검색에 실패했습니다.</p>';
    }
}
