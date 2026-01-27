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
        
        searchResults.innerHTML = data.items.map(item => `
            <div class="search-result-item" data-video-id="${item.id.videoId}">
                <img src="${item.snippet.thumbnails.medium.url}" alt="${item.snippet.title}" />
                <div class="search-result-info">
                    <h4>${item.snippet.title}</h4>
                    <p>${item.snippet.channelTitle}</p>
                </div>
            </div>
        `).join('');
        
        // 클릭 이벤트 추가
        document.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const videoId = item.dataset.videoId;
                const url = `https://www.youtube.com/watch?v=${videoId}`;
                
                // 저장 화면으로 전환하고 URL 입력
                document.querySelector('[data-page="save"]').click();
                setTimeout(() => {
                    document.getElementById('url-input').value = url;
                    document.getElementById('url-submit-btn').click();
                }, 100);
            });
        });
        
    } catch (error) {
        console.error('검색 실패:', error);
        searchResults.innerHTML = '<p>검색에 실패했습니다.</p>';
    }
}
