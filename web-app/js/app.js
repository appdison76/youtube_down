// 앱 메인 로직 - 페이지 전환 (스크립트가 body 맨 아래 로드되므로 DOM은 이미 준비된 경우가 많음)
function initApp() {
    // PRO 설치 배너 링크: 로컬/사설IP(폰 와이파이 등)는 8000 포트, 배포는 GitHub Pages
    const banner = document.getElementById('pro-install-banner');
    if (banner) {
        const host = window.location.hostname;
        const isPrivateIP = /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(host);
        const isLocal = host === 'localhost' || host === '127.0.0.1' || isPrivateIP;
        banner.href = isLocal
            ? `http://${host}:8000/install-page/`
            : 'https://appdison76.github.io/youtube_down/web-app/install-page/';
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

    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetPage = tab.dataset.page;
            
            // 탭 활성화
            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // 페이지 전환
            pages.forEach(p => {
                p.classList.remove('active');
                p.style.display = 'none';
            });
            
            const targetPageElement = document.getElementById(`${targetPage}-page`);
            if (targetPageElement) {
                targetPageElement.classList.add('active');
                targetPageElement.style.display = 'block';
            }
        });
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
