// YouTube URL 저장 기능
const urlInput = document.getElementById('url-input');
const urlSubmitBtn = document.getElementById('url-submit-btn');
const urlClearBtn = document.getElementById('url-clear-btn');
const videoInfo = document.getElementById('video-info');

let currentVideoUrl = null;
let currentVideoId = null;

/** 공유 문장·따옴표·ZWSP 제거 (모바일 복사 대응) */
function sanitizePaste(raw) {
    return String(raw || '')
        .trim()
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\u201C\u201D\u2018\u2019]/g, "'");
}

/** 본문에 URL+설명이 섞인 경우 https 링크 후보 나열 (앱 MainActivity와 동일 취지) */
function extractHttpsCandidates(s) {
    var out = [];
    var re = /https?:\/\/[^\s<>"'()]+/gi;
    var m;
    while ((m = re.exec(s)) !== null) {
        var part = m[0].replace(/[),.;:}\]>]+$/g, '');
        out.push(part);
    }
    if (out.length === 0 && s.length > 0) {
        out.push(s);
    }
    return out;
}

/** 한 줄 URL → watch?v= 표준화 (m.youtube·로케일·shorts·live) */
function parseYoutubeUrlSingle(raw) {
    var u = (raw || '').trim();
    if (!u) return null;

    if (/^[a-zA-Z0-9_-]{10,}$/.test(u)) {
        return {
            videoId: u,
            canonicalUrl: 'https://www.youtube.com/watch?v=' + u,
        };
    }
    if (/^youtu\.be\//i.test(u) && !/^https?:\/\//i.test(u)) u = 'https://' + u;
    else if (/^www\.(youtube\.com|youtu\.be)/i.test(u) && !/^https?:\/\//i.test(u)) u = 'https://' + u;
    else if (/^youtube\.com/i.test(u) && !/^https?:\/\//i.test(u)) u = 'https://' + u;
    if (u.startsWith(':om/') || u.startsWith('om/')) u = 'https://www.youtub' + u;
    if (u.startsWith('be.com/')) u = 'https://www.youtu' + u;

    var shorts = u.match(
        /(?:m\.)?youtube\.com(?:\/[a-z]{2}(?:-[a-zA-Z]{2})?)?\/shorts\/([^&\s/?#]+)/i
    );
    if (shorts) {
        var sid = shorts[1].split('?')[0].split('&')[0];
        return { videoId: sid, canonicalUrl: 'https://www.youtube.com/watch?v=' + sid };
    }
    var liveM = u.match(
        /(?:m\.)?youtube\.com(?:\/[a-z]{2}(?:-[a-zA-Z]{2})?)?\/live\/([^&\s?#]+)/i
    );
    if (liveM) {
        var lid = liveM[1].split('?')[0].split('&')[0];
        return { videoId: lid, canonicalUrl: 'https://www.youtube.com/watch?v=' + lid };
    }
    var watchM = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/i);
    if (watchM) {
        var vid = watchM[1].split('?')[0].split('&')[0];
        return { videoId: vid, canonicalUrl: 'https://www.youtube.com/watch?v=' + vid };
    }
    var watchAlt = u.match(/youtube\.com\/watch\?[^#]*v=([a-zA-Z0-9_-]+)/i);
    if (watchAlt) {
        var vid2 = watchAlt[1].split('?')[0].split('&')[0];
        return { videoId: vid2, canonicalUrl: 'https://www.youtube.com/watch?v=' + vid2 };
    }
    return null;
}

/** sanitize + 후보 순회 — 앱과 같은 의도 */
function parseYoutubeUrlForSave(raw) {
    var cleaned = sanitizePaste(raw);
    if (!cleaned) return null;

    var candidates = extractHttpsCandidates(cleaned);
    var seen = Object.create(null);
    var tryList = [];
    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (!seen[c]) {
            seen[c] = true;
            tryList.push(c);
        }
    }
    if (!seen[cleaned]) tryList.push(cleaned);

    for (var j = 0; j < tryList.length; j++) {
        var parsed = parseYoutubeUrlSingle(tryList[j]);
        if (parsed) return parsed;
    }
    return null;
}

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

    const parsed = parseYoutubeUrlForSave(url);
    if (!parsed) {
        alert('올바른 YouTube URL을 입력해주세요.');
        return;
    }

    currentVideoId = parsed.videoId;
    currentVideoUrl = parsed.canonicalUrl;
    urlInput.value = parsed.canonicalUrl;

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
                        ${window.__FROM_APP__ ? '<button type="button" class="card-btn card-btn-play-only" data-url="' + currentVideoUrl.replace(/"/g, '&quot;') + '"><ion-icon name="play-circle-outline"></ion-icon> 재생</button>' : `<button type="button" class="card-btn card-btn-download-video" data-url="${currentVideoUrl.replace(/"/g, '&quot;')}" data-title="${title}"><ion-icon name="download-outline"></ion-icon> 영상</button><button type="button" class="card-btn card-btn-download-audio" data-url="${currentVideoUrl.replace(/"/g, '&quot;')}" data-title="${title}"><ion-icon name="download-outline"></ion-icon> 음악</button>`}
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

        if (window.__FROM_APP__) {
            videoInfo.querySelectorAll('.card-btn-play-only').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const url = btn.dataset.url;
                    if (url) window.open(url, '_blank');
                });
            });
        } else {
            videoInfo.querySelectorAll('.card-btn-download-video').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const url = btn.dataset.url;
                    const title = btn.dataset.title || 'video';
                    try {
                        const base = await getDownloadBaseUrl();
                        window.open(base + '/api/download/video?url=' + encodeURIComponent(url) + '&quality=highestvideo&title=' + encodeURIComponent(title) + '&client=web-app', '_blank');
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
                        window.open(base + '/api/download/audio?url=' + encodeURIComponent(url) + '&quality=highestaudio&title=' + encodeURIComponent(title) + '&client=web-app', '_blank');
                    } catch (err) {
                        console.error(err);
                        alert('다운로드에 실패했습니다.');
                    }
                });
            });
        }
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
    var u = String(url).trim();
    var parsed = parseYoutubeUrlForSave(u);
    urlInput.value = parsed ? parsed.canonicalUrl : u;
    updateUrlClearVisibility();
    setTimeout(function () { handleUrlSubmit(); }, 0);
};
