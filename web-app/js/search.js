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
                <div class="youtube-result-card search-result-card card-clickable" data-video-id="${videoId}" data-url="${url.replace(/"/g, '&quot;')}">
                    ${thumb ? `<img src="${thumb}" alt="" class="youtube-card-thumbnail" />` : '<div class="youtube-card-thumbnail placeholder"></div>'}
                    <div class="youtube-card-content">
                        <h4 class="youtube-card-title">${title}</h4>
                        <p class="youtube-card-channel">${channel}</p>
                        <div class="youtube-card-actions">
                            <button type="button" class="card-btn card-btn-favorite" data-video-id="${videoId}" data-title="${(title || '').replace(/"/g, '&quot;')}" data-channel="${(channel || '').replace(/"/g, '&quot;')}" data-thumb="${(thumb || '').replace(/"/g, '&quot;')}" data-url="${url.replace(/"/g, '&quot;')}">☆ 찜하기</button>
                            <button type="button" class="card-btn card-btn-download-video" data-url="${url.replace(/"/g, '&quot;')}" data-title="${(title || '').replace(/"/g, '&quot;')}"><ion-icon name="download-outline"></ion-icon> 영상</button>
                            <button type="button" class="card-btn card-btn-download-audio" data-url="${url.replace(/"/g, '&quot;')}" data-title="${(title || '').replace(/"/g, '&quot;')}">🎵 음악</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // 카드 클릭 시 유튜브 재생 (버튼 클릭은 제외)
        searchResults.querySelectorAll('.youtube-result-card.card-clickable').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const url = card.dataset.url;
                if (url) window.open(url, '_blank');
            });
        });
        // 찜 상태 표시 (비찜=☆, 찜=★ 노란 배경)
        for (const card of searchResults.querySelectorAll('.youtube-result-card')) {
            const videoId = card.dataset.videoId;
            const btn = card.querySelector('.card-btn-favorite');
            if (btn && typeof hasItem === 'function') {
                const isFav = await hasItem(videoId);
                btn.textContent = isFav ? '★ 찜함' : '☆ 찜하기';
                btn.classList.toggle('is-favorited', !!isFav);
                if (isFav) {
                    btn.style.background = '#F9A825';
                    btn.style.color = '#fff';
                    btn.style.borderColor = '#F9A825';
                } else {
                    btn.style.background = '';
                    btn.style.color = '';
                    btn.style.borderColor = '';
                }
            }
        }
        searchResults.querySelectorAll('.card-btn-download-video').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const url = btn.dataset.url;
                const title = btn.dataset.title || 'video';
                const videoId = url.match(/v=([^&]+)/)?.[1] || '';
                try {
                    const base = await getDownloadBaseUrl();
                    window.open(base + '/api/download/video?url=' + encodeURIComponent(url) + '&quality=highestvideo&title=' + encodeURIComponent(title), '_blank');
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
                    const base = await getDownloadBaseUrl();
                    window.open(base + '/api/download/audio?url=' + encodeURIComponent(url) + '&quality=highestaudio&title=' + encodeURIComponent(title), '_blank');
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
                    btn.textContent = '☆ 찜하기';
                    btn.classList.remove('is-favorited');
                    btn.style.background = '';
                    btn.style.color = '';
                    btn.style.borderColor = '';
                } else if (typeof addItem === 'function') {
                    await addItem({ id: videoId, title: btn.dataset.title || '', author: btn.dataset.channel || '', thumbnail: btn.dataset.thumb || '', url: btn.dataset.url || '', type: 'favorite' });
                    btn.textContent = '★ 찜함';
                    btn.classList.add('is-favorited');
                    btn.style.background = '#F9A825';
                    btn.style.color = '#fff';
                    btn.style.borderColor = '#F9A825';
                }
            });
        });
        
    } catch (error) {
        console.error('검색 실패:', error);
        searchResults.innerHTML = '<p>검색에 실패했습니다.</p>';
    }
}
