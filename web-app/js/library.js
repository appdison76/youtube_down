// 찜하기만 관리
const libraryItems = document.getElementById('library-items');
const librarySearch = document.getElementById('library-search');
const libraryClearBtn = document.getElementById('library-clear-btn');

function updateLibraryClearVisibility() {
    libraryClearBtn.style.display = librarySearch.value.trim() ? 'flex' : 'none';
}
librarySearch.addEventListener('input', updateLibraryClearVisibility);
librarySearch.addEventListener('paste', () => setTimeout(updateLibraryClearVisibility, 0));

libraryClearBtn.addEventListener('click', () => {
    librarySearch.value = '';
    librarySearch.focus();
    libraryClearBtn.style.display = 'none';
    loadLibraryItems();
});

// 검색 이벤트
librarySearch.addEventListener('input', async () => {
    const query = librarySearch.value.trim();
    if (query) {
        const allFavorites = await getAllItems('favorite');
        const lowerQuery = query.toLowerCase();
        const results = allFavorites.filter(item =>
            item.title?.toLowerCase().includes(lowerQuery) ||
            item.author?.toLowerCase().includes(lowerQuery) ||
            item.artist?.toLowerCase().includes(lowerQuery)
        );
        displayItems(results);
    } else {
        loadLibraryItems();
    }
});

// 찜하기 목록 로드
async function loadLibraryItems() {
    libraryItems.innerHTML = '<p>로딩 중...</p>';
    try {
        const items = await getAllItems('favorite');
        displayItems(items);
    } catch (error) {
        console.error('찜하기 로드 실패:', error);
        libraryItems.innerHTML = '<p>찜한 항목을 불러오는데 실패했습니다.</p>';
    }
}

// 찜하기에서 "다운로드" 버튼 → 다운로드 탭으로 이동 후 해당 영상 셋팅
function goToDownloadFromFavorite(url) {
    var saveTab = document.querySelector('[data-page="save"]');
    if (saveTab) saveTab.click();
    setTimeout(function () {
        if (window.setDownloadUrlAndFetch && url) window.setDownloadUrlAndFetch(url);
    }, 350);
}

// 항목 표시: 검색 카드와 동일한 모양, 카드 클릭 = 유튜브 재생, 다운로드(영상 버튼 아이콘) / 찜삭제
function displayItems(items) {
    if (items.length === 0) {
        libraryItems.innerHTML = '<p>찜한 항목이 없습니다.</p>';
        return;
    }
    libraryItems.innerHTML = items.map(function (item) {
        var url = (item.url || '').replace(/"/g, '&quot;');
        var title = (item.title || '').replace(/"/g, '&quot;');
        var thumb = item.thumbnail || '';
        var author = item.author || item.artist || '';
        var urlEsc = (item.url || '').replace(/'/g, "\\'");
        var idEsc = (item.id || '').replace(/'/g, "\\'");
        return '<div class="youtube-result-card card-clickable library-favorite-card" data-url="' + url + '" role="button" tabindex="0">' +
            (thumb ? '<img src="' + thumb + '" alt="" class="youtube-card-thumbnail" />' : '<div class="youtube-card-thumbnail placeholder"></div>') +
            '<div class="youtube-card-content">' +
            '<h4 class="youtube-card-title">' + (item.title || '') + '</h4>' +
            '<p class="youtube-card-channel">' + author + '</p>' +
            '<div class="youtube-card-actions">' +
            '<button type="button" class="card-btn card-btn-download-video" onclick="event.stopPropagation(); goToDownloadFromFavorite(\'' + urlEsc + '\');"><ion-icon name="download-outline"></ion-icon> 다운로드</button>' +
            '<button type="button" class="card-btn card-btn-remove-favorite" onclick="event.stopPropagation(); removeFavorite(\'' + idEsc + '\');"><ion-icon name="trash-outline"></ion-icon> 찜삭제</button>' +
            '</div></div></div>';
    }).join('');

    // 카드 클릭 시 유튜브 재생 (새 탭)
    libraryItems.querySelectorAll('.youtube-result-card.card-clickable').forEach(function (el) {
        var url = el.getAttribute('data-url');
        if (!url) return;
        el.addEventListener('click', function (e) {
            if (e.target.closest('button')) return;
            window.open(url, '_blank');
        });
        el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (e.target.closest('button')) return;
                window.open(url, '_blank');
            }
        });
    });
}

// 찜하기 삭제
async function removeFavorite(id) {
    if (confirm('찜하기에서 삭제하시겠습니까?')) {
        await removeItem(id);
        loadLibraryItems();
    }
}

window.removeFavorite = removeFavorite;

// 찜하기 탭 클릭 시 로드
document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('[data-page="library"]').addEventListener('click', () => {
        setTimeout(loadLibraryItems, 100);
    });
});
