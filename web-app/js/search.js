// YouTube 검색 기능
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchClearBtn = document.getElementById('search-clear-btn');
const searchResults = document.getElementById('search-results');
const searchSuggestions = document.getElementById('search-suggestions');

function updateSearchClearVisibility() {
    searchClearBtn.style.display = searchInput.value.trim() ? 'flex' : 'none';
}

// 자동완성: 최근 검색어 + 서버 추천 (끄기 가능, 앱과 동일)
let suggestDebounceTimer = null;
const SUGGEST_DEBOUNCE_MS = 280;
const RECENT_SEARCHES_KEY = 'webapp_recent_searches';
const MAX_RECENT_SEARCHES = 15;
const AUTCOMPLETE_ENABLED_KEY = 'webapp_autocomplete_enabled';

function isAutocompleteEnabled() {
    try {
        var v = localStorage.getItem(AUTCOMPLETE_ENABLED_KEY);
        if (v === null) return true;
        return v === 'true';
    } catch (e) { return true; }
}
function setAutocompleteEnabled(enabled) {
    try { localStorage.setItem(AUTCOMPLETE_ENABLED_KEY, enabled ? 'true' : 'false'); } catch (e) {}
}

function getRecentSearches() {
    try {
        var raw = localStorage.getItem(RECENT_SEARCHES_KEY);
        if (!raw) return [];
        var arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
}

function saveRecentSearch(query) {
    if (!query || !query.trim()) return;
    var q = query.trim();
    var arr = getRecentSearches();
    arr = arr.filter(function (item) { return item !== q; });
    arr.unshift(q);
    arr = arr.slice(0, MAX_RECENT_SEARCHES);
    try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(arr)); } catch (e) {}
}

function removeRecentSearch(text) {
    if (!text || !String(text).trim()) return;
    var q = String(text).trim();
    var arr = getRecentSearches().filter(function (item) { return item !== q; });
    try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(arr)); } catch (e) {}
}

function hideSuggestions() {
    searchSuggestions.style.display = 'none';
    searchSuggestions.innerHTML = '';
}

function escapeForSuggest(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function unescapeSuggest(val) {
    return (val || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

var lastSuggestionsServer = [];

function showSuggestions(opts) {
    var recent = opts && Array.isArray(opts.recent) ? opts.recent : [];
    var server = opts && Array.isArray(opts.server) ? opts.server : [];
    lastSuggestionsServer = server;
    if (recent.length === 0 && server.length === 0) {
        hideSuggestions();
        return;
    }
    var html = '';
    if (recent.length > 0) {
        html += '<div class="search-suggestions-label"><ion-icon name="time-outline"></ion-icon> 최근 검색</div>';
        recent.forEach(function (text) {
            var escaped = escapeForSuggest(text);
            html += '<div class="search-suggestions-item search-suggestions-recent" role="option" data-value="' + escaped + '">' +
                '<ion-icon name="time-outline"></ion-icon><span class="search-suggestions-text">' + escaped + '</span>' +
                '<button type="button" class="search-suggestions-delete" title="삭제" aria-label="삭제" data-value="' + escaped + '"><ion-icon name="close-circle"></ion-icon></button></div>';
        });
    }
    if (server.length > 0) {
        html += '<div class="search-suggestions-label"><ion-icon name="flash-outline"></ion-icon> 추천</div>';
        server.forEach(function (text) {
            var escaped = escapeForSuggest(text);
            html += '<div class="search-suggestions-item search-suggestions-server" role="option" data-value="' + escaped + '"><ion-icon name="flash-outline"></ion-icon><span class="search-suggestions-text">' + escaped + '</span></div>';
        });
    }
    searchSuggestions.innerHTML = html;
    searchSuggestions.style.display = 'block';

    searchSuggestions.querySelectorAll('.search-suggestions-item').forEach(function (el) {
        el.addEventListener('click', function (e) {
            if (e.target.closest('.search-suggestions-delete')) return;
            e.preventDefault();
            var val = el.getAttribute('data-value');
            if (val != null) {
                searchInput.value = unescapeSuggest(val);
                hideSuggestions();
                searchInput.focus();
            }
        });
    });

    searchSuggestions.querySelectorAll('.search-suggestions-delete').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var val = btn.getAttribute('data-value');
            if (val == null) return;
            var text = unescapeSuggest(val);
            removeRecentSearch(text);
            var q = searchInput.value.trim();
            var newRecent = getRecentSearches();
            if (q.length > 0) newRecent = newRecent.filter(function (item) { return (item || '').toLowerCase().indexOf(q.toLowerCase()) !== -1; });
            showSuggestions({ recent: newRecent, server: lastSuggestionsServer });
        });
    });
}

function showSuggestionsFlat(list) {
    if (!list || list.length === 0) {
        hideSuggestions();
        return;
    }
    showSuggestions({ recent: list, server: [] });
}

function onSearchInputForSuggest() {
    if (!isAutocompleteEnabled()) {
        hideSuggestions();
        return;
    }
    var q = searchInput.value.trim();
    if (q.length === 0) {
        var recent = getRecentSearches();
        showSuggestions({ recent: recent, server: [] });
        return;
    }
    if (suggestDebounceTimer) clearTimeout(suggestDebounceTimer);
    suggestDebounceTimer = setTimeout(async function () {
        suggestDebounceTimer = null;
        if (searchInput.value.trim() !== q) return;
        try {
            var recent = getRecentSearches().filter(function (item) {
                return (item || '').toLowerCase().indexOf(q.toLowerCase()) !== -1;
            });
            var serverList = typeof getSearchSuggestions === 'function' ? await getSearchSuggestions(q) : [];
            if (searchInput.value.trim() !== q) return;
            var seen = {};
            var recentFiltered = [];
            recent.forEach(function (s) {
                if (!seen[s]) { seen[s] = true; recentFiltered.push(s); }
            });
            var serverFiltered = (Array.isArray(serverList) ? serverList : []).filter(function (s) {
                if (seen[s]) return false;
                seen[s] = true;
                return true;
            });
            showSuggestions({ recent: recentFiltered, server: serverFiltered });
        } catch (err) {
            console.warn('자동완성 오류:', err);
            hideSuggestions();
        }
    }, SUGGEST_DEBOUNCE_MS);
}

searchInput.addEventListener('input', function () {
    updateSearchClearVisibility();
    onSearchInputForSuggest();
});
searchInput.addEventListener('paste', function () { setTimeout(function () { updateSearchClearVisibility(); onSearchInputForSuggest(); }, 0); });

// 포커스 시에는 레이어 안 띄움 → 검색 후 결과를 가리지 않음. 입력/붙여넣기할 때만 표시
searchInput.addEventListener('blur', function () {
    setTimeout(hideSuggestions, 180);
});
searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideSuggestions();
    if (e.key === 'Enter') hideSuggestions();
});

searchClearBtn.addEventListener('click', function () {
    searchInput.value = '';
    searchInput.focus();
    searchClearBtn.style.display = 'none';
    searchResults.innerHTML = '';
    hideSuggestions();
});

// 자동완성 켜기/끄기 토글 (앱과 동일)
var autocompleteToggle = document.getElementById('search-autocomplete-toggle');
if (autocompleteToggle) {
    autocompleteToggle.checked = isAutocompleteEnabled();
    autocompleteToggle.addEventListener('change', function () {
        setAutocompleteEnabled(autocompleteToggle.checked);
        if (!autocompleteToggle.checked) hideSuggestions();
    });
}

searchBtn.addEventListener('click', function () {
    hideSuggestions();
    performSearch();
});
searchInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        hideSuggestions();
        performSearch();
    }
});

async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    saveRecentSearch(query);

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
                            <button type="button" class="card-btn card-btn-download-audio" data-url="${url.replace(/"/g, '&quot;')}" data-title="${(title || '').replace(/"/g, '&quot;')}"><ion-icon name="download-outline"></ion-icon> 음악</button>
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
