// YouTube URL 저장 기능
const urlInput = document.getElementById('url-input');
const urlSubmitBtn = document.getElementById('url-submit-btn');
const urlClearBtn = document.getElementById('url-clear-btn');
const videoInfo = document.getElementById('video-info');

let currentVideoUrl = null;
let currentVideoId = null;

function updateUrlClearVisibility() {
    urlClearBtn.style.display = urlInput.value.trim() ? 'flex' : 'none';
}
urlInput.addEventListener('input', updateUrlClearVisibility);
urlInput.addEventListener('paste', () => setTimeout(updateUrlClearVisibility, 0));

urlClearBtn.addEventListener('click', () => {
    urlInput.value = '';
    urlInput.focus();
    urlClearBtn.style.display = 'none';
    videoInfo.style.display = 'none';
    videoInfo.innerHTML = '';
    currentVideoUrl = null;
    currentVideoId = null;
});

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

    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (!videoIdMatch) {
        alert('올바른 YouTube URL을 입력해주세요.');
        return;
    }

    currentVideoId = videoIdMatch[1];
    currentVideoUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;

    videoInfo.style.display = 'none';
    videoInfo.innerHTML = '';
    urlSubmitBtn.textContent = '로딩 중...';
    urlSubmitBtn.disabled = true;

    try {
        const info = await getVideoInfo(currentVideoUrl);
        const thumb = info.thumbnail || '';
        const title = (info.title || '').replace(/"/g, '&quot;');
        const channel = (info.author || '').replace(/"/g, '&quot;');
        const isFavorite = await hasItem(currentVideoId);
        const favoriteLabel = isFavorite ? '★ 찜함' : '☆ 찜하기';
        const filesize = info.filesize || info.filesize_approx || info.filesize_estimate;
        const sizeText = typeof filesize === 'number' && filesize > 0
            ? '예상 크기: ' + (filesize >= 1024 * 1024 ? (filesize / (1024 * 1024)).toFixed(1) + ' MB' : (filesize / 1024).toFixed(0) + ' KB')
            : '';

        videoInfo.innerHTML =
            `<div class="youtube-result-card search-result-card card-clickable save-result-card" data-video-id="${currentVideoId}" data-url="${currentVideoUrl.replace(/"/g, '&quot;')}">
                ${thumb ? `<img src="${thumb}" alt="" class="youtube-card-thumbnail" />` : '<div class="youtube-card-thumbnail placeholder"></div>'}
                <div class="youtube-card-content">
                    <h4 class="youtube-card-title">${info.title || ''}</h4>
                    <p class="youtube-card-channel">${info.author || ''}</p>
                    ${sizeText ? '<p class="youtube-card-filesize">' + sizeText + '</p>' : ''}
                    <div class="youtube-card-actions">
                        <button type="button" class="card-btn card-btn-favorite ${isFavorite ? 'is-favorited' : ''}" data-video-id="${currentVideoId}" data-title="${title}" data-channel="${channel}" data-thumb="${(thumb || '').replace(/"/g, '&quot;')}" data-url="${currentVideoUrl.replace(/"/g, '&quot;')}">${favoriteLabel}</button>
                        <button type="button" class="card-btn card-btn-download-video" data-url="${currentVideoUrl.replace(/"/g, '&quot;')}" data-title="${title}"><ion-icon name="download-outline"></ion-icon> 영상</button>
                        <button type="button" class="card-btn card-btn-download-audio" data-url="${currentVideoUrl.replace(/"/g, '&quot;')}" data-title="${title}"><ion-icon name="download-outline"></ion-icon> 음악</button>
                    </div>
                </div>
            </div>
        `;

        if (isFavorite) {
            const favBtn = videoInfo.querySelector('.card-btn-favorite');
            if (favBtn) {
                favBtn.style.background = '#F9A825';
                favBtn.style.color = '#fff';
                favBtn.style.borderColor = '#F9A825';
            }
        }

        videoInfo.style.display = 'block';

        const card = videoInfo.querySelector('.youtube-result-card.card-clickable');
        if (card) {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                if (currentVideoUrl) window.open(currentVideoUrl, '_blank');
            });
        }

        videoInfo.querySelectorAll('.card-btn-favorite').forEach(btn => {
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
                    await addItem({
                        id: videoId,
                        title: btn.dataset.title || '',
                        author: btn.dataset.channel || '',
                        thumbnail: btn.dataset.thumb || '',
                        url: btn.dataset.url || '',
                        type: 'favorite',
                    });
                    btn.textContent = '★ 찜함';
                    btn.classList.add('is-favorited');
                    btn.style.background = '#F9A825';
                    btn.style.color = '#fff';
                    btn.style.borderColor = '#F9A825';
                }
            });
        });

        videoInfo.querySelectorAll('.card-btn-download-video').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const url = btn.dataset.url;
                const title = btn.dataset.title || 'video';
                try {
                    const base = await getDownloadBaseUrl();
                    window.open(base + '/api/download/video?url=' + encodeURIComponent(url) + '&quality=highestvideo&title=' + encodeURIComponent(title), '_blank');
                } catch (err) {
                    console.error(err);
                    alert('다운로드에 실패했습니다.');
                }
            });
        });

        videoInfo.querySelectorAll('.card-btn-download-audio').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const url = btn.dataset.url;
                const title = btn.dataset.title || 'audio';
                try {
                    const base = await getDownloadBaseUrl();
                    window.open(base + '/api/download/audio?url=' + encodeURIComponent(url) + '&quality=highestaudio&title=' + encodeURIComponent(title), '_blank');
                } catch (err) {
                    console.error(err);
                    alert('다운로드에 실패했습니다.');
                }
            });
        });
    } catch (error) {
        console.error('영상 정보 가져오기 실패:', error);
        alert('영상 정보를 가져오는데 실패했습니다.');
    } finally {
        urlSubmitBtn.textContent = '가져오기';
        urlSubmitBtn.disabled = false;
    }
}

// 찜하기에서 "다운로드로 이동" 시 URL 셋팅 후 가져오기 (library.js에서 호출)
window.setDownloadUrlAndFetch = function (url) {
    if (!url || !urlInput) return;
    // 짧은 주소(youtu.be/xxx)나 ID만 있어도 동작하도록 정규화
    var u = String(url).trim();
    if (/^[a-zA-Z0-9_-]{10,}$/.test(u)) {
        u = 'https://www.youtube.com/watch?v=' + u;
    } else if (/^youtu\.be\//i.test(u) && !/^https?:\/\//i.test(u)) {
        u = 'https://' + u;
    } else if (/^www\./i.test(u) && !/^https?:\/\//i.test(u)) {
        u = 'https://' + u;
    }
    urlInput.value = u;
    updateUrlClearVisibility();
    setTimeout(function () { handleUrlSubmit(); }, 0);
};
