// from_app=1 이면 앱에서 연 것. 영상/음악 다운로드 버튼 대신 재생 버튼 1개만 표시 (심사용). 심사 끝나면 이 플래그 로직만 제거하면 됨.
window.__FROM_APP__ = (new URLSearchParams(location.search).get('from_app') === '1');

// 앱 메인 로직 - 페이지 전환 (스크립트가 body 맨 아래 로드되므로 DOM은 이미 준비된 경우가 많음)
function initApp() {
    // from_app=1 이면 섹션 제목을 "다운로드" → "재생하기"로 표시
    if (window.__FROM_APP__) {
        const searchTitle = document.querySelector('#search-page .section-title');
        if (searchTitle) searchTitle.textContent = 'YouTube 검색으로 재생하기';
        const saveTitle = document.querySelector('#save-page .section-title');
        if (saveTitle) saveTitle.textContent = '링크로 재생하기';
        const recognitionTitle = document.querySelector('#recognition-youtube-area .section-title');
        if (recognitionTitle) recognitionTitle.textContent = '재생할 영상 선택';
    }

    // PRO 설치 배너 링크: 로컬/사설IP(폰 와이파이 등)는 8000 포트, 배포는 GitHub Pages
    const banner = document.getElementById('pro-install-banner');
    if (banner) {
        const host = window.location.hostname;
        const isPrivateIP = /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(host);
        const isLocal = host === 'localhost' || host === '127.0.0.1' || isPrivateIP;
        banner.href = isLocal
            ? `http://${host}:8000/install-page/`
            : 'https://melodysnap-app.mediacommercelab.com/web-app/install-page/';
    }

    const navTabs = document.querySelectorAll('.nav-tab');
    const pages = document.querySelectorAll('.page');

    // 타이틀바 로고/아이콘 클릭 시 음악소리로(첫 탭)로 이동
    const headerHomeBtn = document.getElementById('header-home-btn');
    if (headerHomeBtn) {
        headerHomeBtn.addEventListener('click', () => {
            const firstTab = document.querySelector('.nav-tab[data-page="recognition"]');
            if (firstTab && !firstTab.classList.contains('active')) {
                firstTab.click();
            }
        });
    }

    function showPage(targetPage) {
        navTabs.forEach(t => t.classList.remove('active'));
        const tab = document.querySelector('.nav-tab[data-page="' + targetPage + '"]');
        if (tab) tab.classList.add('active');
        pages.forEach(p => {
            p.classList.remove('active');
            p.style.display = 'none';
        });
        const targetPageElement = document.getElementById(targetPage + '-page');
        if (targetPageElement) {
            targetPageElement.classList.add('active');
            targetPageElement.style.display = 'block';
        }
    }

    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            showPage(tab.dataset.page);
        });
    });

    // 앱에서 링크로 올 때: ?page=save 또는 #save 이면 링크복사 탭으로, url= 쿼리 있으면 입력란에 채움
    var params = new URLSearchParams(location.search);
    var pageParam = params.get('page');
    var hash = (location.hash || '').replace(/^#/, '');
    var targetPage = pageParam || hash;
    if (targetPage && document.getElementById(targetPage + '-page')) {
        showPage(targetPage);
    }
    var urlParam = params.get('url');
    if (urlParam && document.getElementById('url-input')) {
        var urlInput = document.getElementById('url-input');
        urlInput.value = urlParam;
        urlInput.dispatchEvent(new Event('input', { bubbles: true }));
        var submitBtn = document.getElementById('url-submit-btn');
        if (submitBtn) {
            setTimeout(function () { submitBtn.click(); }, 300);
        }
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
