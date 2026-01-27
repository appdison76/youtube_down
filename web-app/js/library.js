// 내 저장소 기능
const libraryItems = document.getElementById('library-items');
const librarySearch = document.getElementById('library-search');
const filterBtns = document.querySelectorAll('.filter-btn');

let currentFilter = 'all';

// 필터 버튼 이벤트
filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        loadLibraryItems();
    });
});

// 검색 이벤트
librarySearch.addEventListener('input', async () => {
    const query = librarySearch.value.trim();
    
    if (query) {
        const results = await searchItems(query);
        displayItems(results);
    } else {
        loadLibraryItems();
    }
});

// 저장소 항목 로드
async function loadLibraryItems() {
    libraryItems.innerHTML = '<p>로딩 중...</p>';
    
    try {
        const items = await getAllItems(currentFilter);
        displayItems(items);
    } catch (error) {
        console.error('항목 로드 실패:', error);
        libraryItems.innerHTML = '<p>항목을 불러오는데 실패했습니다.</p>';
    }
}

// 항목 표시
function displayItems(items) {
    if (items.length === 0) {
        libraryItems.innerHTML = '<p>저장된 항목이 없습니다.</p>';
        return;
    }
    
    libraryItems.innerHTML = items.map(item => `
        <div class="library-item">
            <img src="${item.thumbnail}" alt="${item.title}" />
            <div class="library-item-info">
                <h4>${item.title}</h4>
                <p>${item.author || item.artist || ''}</p>
                <div class="library-item-badge">${item.type === 'favorite' ? '찜하기' : '다운로드'}</div>
                <div style="margin-top: 8px;">
                    <button class="action-btn" onclick="window.open('${item.url}', '_blank')">열기</button>
                    ${item.type === 'favorite' ? 
                        `<button class="action-btn" onclick="removeFavorite('${item.id}')">삭제</button>` :
                        `<button class="action-btn" onclick="removeDownload('${item.id}')">삭제</button>`
                    }
                </div>
            </div>
        </div>
    `).join('');
}

// 찜하기 삭제
async function removeFavorite(id) {
    if (confirm('찜하기에서 삭제하시겠습니까?')) {
        await removeItem(id);
        loadLibraryItems();
    }
}

// 다운로드 삭제
async function removeDownload(id) {
    if (confirm('다운로드 목록에서 삭제하시겠습니까?')) {
        await removeItem(id);
        loadLibraryItems();
    }
}

// 전역 함수로 등록
window.removeFavorite = removeFavorite;
window.removeDownload = removeDownload;

// 페이지 로드 시 항목 불러오기
document.addEventListener('DOMContentLoaded', () => {
    // 내 저장소 탭 클릭 시 로드
    document.querySelector('[data-page="library"]').addEventListener('click', () => {
        setTimeout(() => {
            loadLibraryItems();
        }, 100);
    });
});
