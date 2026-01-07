let currentVideoId = null;
let currentFolderId = null;

// 검색 기능
document.getElementById('searchBtn').addEventListener('click', performSearch);
document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
});

async function performSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = '<div class="loading">검색 중...</div>';

    try {
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const data = await response.json();
        
        if (data.error) {
            resultsDiv.innerHTML = `<div class="empty-state"><h3>오류</h3><p>${data.error}</p></div>`;
            return;
        }

        if (data.results && data.results.length > 0) {
            displaySearchResults(data.results);
        } else {
            resultsDiv.innerHTML = '<div class="empty-state"><h3>검색 결과가 없습니다</h3></div>';
        }
    } catch (error) {
        resultsDiv.innerHTML = `<div class="empty-state"><h3>오류</h3><p>${error.message}</p></div>`;
    }
}

function displaySearchResults(results) {
    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = results.map(video => `
        <div class="video-card" data-video-id="${video.id}">
            <img src="${video.thumbnail}" alt="${video.title}" class="video-thumbnail">
            <div class="video-info">
                <div class="video-title">${video.title}</div>
                <div class="video-meta">
                    ${video.channel ? `<div>채널: ${video.channel}</div>` : ''}
                    ${video.duration ? `<div>길이: ${video.duration}</div>` : ''}
                    ${video.views ? `<div>조회수: ${video.views}</div>` : ''}
                </div>
                <div class="video-actions">
                    <button class="btn-small btn-favorite" onclick="addToFavorites('${video.id}', '${video.title.replace(/'/g, "\\'")}', '${video.thumbnail}', '${video.duration || ''}')">
                        ⭐ 찜하기
                    </button>
                    <button class="btn-small btn-download" onclick="openDownloadModal('${video.id}', '${video.title.replace(/'/g, "\\'")}', '${video.thumbnail}')">
                        📥 다운로드
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// 탭 전환
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const tab = btn.dataset.tab;
        
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(`${tab}Tab`).classList.add('active');
        
        if (tab === 'favorites') {
            await loadFolders();
            loadFavorites();
        }
    });
});

// 다운로드 모달
function openDownloadModal(videoId, title, thumbnail) {
    currentVideoId = videoId;
    const modal = document.getElementById('videoModal');
    const modalInfo = document.getElementById('modalVideoInfo');
    
    modalInfo.innerHTML = `
        <h2>${title}</h2>
        <img src="${thumbnail}" style="width: 100%; border-radius: 8px; margin-top: 15px;">
    `;
    
    modal.style.display = 'block';
}

document.querySelectorAll('.download-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const downloadType = btn.dataset.type;
        if (!currentVideoId) return;

        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    video_id: currentVideoId,
                    type: downloadType
                })
            });

            const data = await response.json();
            alert(data.message || data.error || '다운로드가 시작되었습니다');
            document.getElementById('videoModal').style.display = 'none';
        } catch (error) {
            alert('다운로드 중 오류가 발생했습니다: ' + error.message);
        }
    });
});

// 모달 닫기
document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
        closeBtn.closest('.modal').style.display = 'none';
    });
});

window.onclick = (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

// 찜하기 기능
async function addToFavorites(videoId, title, thumbnail, duration) {
    try {
        const response = await fetch('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_id: videoId,
                title: title,
                thumbnail: thumbnail,
                duration: duration,
                folder_id: currentFolderId
            })
        });

        const data = await response.json();
        alert(data.message || data.error || '찜하기에 추가되었습니다');
        
        if (data.message && document.getElementById('favoritesTab').classList.contains('active')) {
            loadFavorites();
        }
    } catch (error) {
        alert('오류가 발생했습니다: ' + error.message);
    }
}

// 찜하기 목록 로드
async function loadFavorites() {
    const favoritesDiv = document.getElementById('favoritesResults');
    favoritesDiv.innerHTML = '<div class="loading">로딩 중...</div>';

    try {
        const url = currentFolderId 
            ? `/api/favorites?folder_id=${currentFolderId}`
            : '/api/favorites';
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            favoritesDiv.innerHTML = `<div class="empty-state"><h3>오류</h3><p>${data.error}</p></div>`;
            return;
        }

        if (data.favorites && data.favorites.length > 0) {
            displayFavorites(data.favorites);
        } else {
            favoritesDiv.innerHTML = '<div class="empty-state"><h3>찜한 영상이 없습니다</h3></div>';
        }
    } catch (error) {
        favoritesDiv.innerHTML = `<div class="empty-state"><h3>오류</h3><p>${error.message}</p></div>`;
    }
}

function displayFavorites(favorites) {
    const favoritesDiv = document.getElementById('favoritesResults');
    favoritesDiv.innerHTML = favorites.map(fav => `
        <div class="video-card" data-favorite-id="${fav.id}">
            <img src="${fav.thumbnail}" alt="${fav.title}" class="video-thumbnail">
            <div class="video-info">
                <div class="video-title">${fav.title}</div>
                <div class="video-meta">
                    ${fav.duration ? `<div>길이: ${fav.duration}</div>` : ''}
                    ${fav.folder_name ? `<div>폴더: ${fav.folder_name}</div>` : ''}
                </div>
                <div class="video-actions">
                    <button class="btn-small btn-download" onclick="openDownloadModal('${fav.video_id}', '${fav.title.replace(/'/g, "\\'")}', '${fav.thumbnail}')">
                        📥 다운로드
                    </button>
                    <button class="btn-small" style="background: #ff6b6b; color: white;" onclick="deleteFavorite(${fav.id})">
                        🗑️ 삭제
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

async function deleteFavorite(favoriteId) {
    if (!confirm('찜하기에서 삭제하시겠습니까?')) return;

    try {
        const response = await fetch(`/api/favorites/${favoriteId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        alert(data.message || '삭제되었습니다');
        loadFavorites();
    } catch (error) {
        alert('오류가 발생했습니다: ' + error.message);
    }
}

// 폴더 관리
async function loadFolders() {
    try {
        const response = await fetch('/api/folders');
        const data = await response.json();
        
        if (data.folders) {
            const folderList = document.getElementById('folderList');
            folderList.innerHTML = data.folders.map(folder => `
                <div class="folder-item ${folder.id === currentFolderId ? 'active' : ''}" 
                     data-folder-id="${folder.id}"
                     onclick="selectFolder(${folder.id}, '${folder.name.replace(/'/g, "\\'")}')">
                    <span>📁</span>
                    <span>${folder.name}</span>
                    <span style="font-size: 12px; opacity: 0.7;">(${folder.count})</span>
                    ${folder.name !== '기본 찜하기' ? `<button onclick="event.stopPropagation(); deleteFolder(${folder.id})" style="background: none; border: none; color: #ff6b6b; cursor: pointer; margin-left: 10px;">✕</button>` : ''}
                </div>
            `).join('');
            
            // 기본 폴더가 선택되지 않았으면 기본 폴더 선택
            if (!currentFolderId && data.folders.length > 0) {
                const defaultFolder = data.folders.find(f => f.name === '기본 찜하기') || data.folders[0];
                if (defaultFolder) {
                    currentFolderId = defaultFolder.id;
                    const defaultFolderElement = folderList.querySelector(`[data-folder-id="${defaultFolder.id}"]`);
                    if (defaultFolderElement) {
                        defaultFolderElement.classList.add('active');
                    }
                }
            }
        }
    } catch (error) {
        console.error('폴더 로드 오류:', error);
    }
}

function selectFolder(folderId, folderName) {
    currentFolderId = folderId;
    document.querySelectorAll('.folder-item').forEach(item => {
        const itemFolderId = item.dataset.folderId ? parseInt(item.dataset.folderId) : null;
        item.classList.remove('active');
        if (itemFolderId === folderId) {
            item.classList.add('active');
        }
    });
    loadFavorites();
}

// 새 폴더 생성
document.getElementById('createFolderBtn').addEventListener('click', () => {
    document.getElementById('folderModal').style.display = 'block';
    document.getElementById('folderNameInput').value = '';
});

document.getElementById('confirmFolderBtn').addEventListener('click', async () => {
    const folderName = document.getElementById('folderNameInput').value.trim();
    if (!folderName) {
        alert('폴더 이름을 입력해주세요');
        return;
    }

    try {
        const response = await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: folderName })
        });

        const data = await response.json();
        alert(data.message || data.error || '폴더가 생성되었습니다');
        document.getElementById('folderModal').style.display = 'none';
        loadFolders();
    } catch (error) {
        alert('오류가 발생했습니다: ' + error.message);
    }
});

async function deleteFolder(folderId) {
    if (!confirm('이 폴더를 삭제하시겠습니까? 폴더의 영상들은 기본 찜하기로 이동됩니다.')) return;

    try {
        const response = await fetch(`/api/folders/${folderId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        alert(data.message || data.error || '폴더가 삭제되었습니다');
        if (currentFolderId === folderId) {
            currentFolderId = null;
        }
        loadFolders();
        loadFavorites();
    } catch (error) {
        alert('오류가 발생했습니다: ' + error.message);
    }
}

// 페이지 로드 시 기본 폴더 선택
window.addEventListener('load', async () => {
    if (document.getElementById('favoritesTab').classList.contains('active')) {
        await loadFolders();
        loadFavorites();
    }
});

