// 앱 메인 로직 - 페이지 전환
document.addEventListener('DOMContentLoaded', () => {
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

    // 타이틀바 로고/아이콘 클릭 시 첫 페이지로 리로드 (새로고침)
    const headerLeft = document.querySelector('.header-left');
    if (headerLeft) {
        headerLeft.style.cursor = 'pointer';
        const reloadToFirstPage = () => location.reload();
        headerLeft.addEventListener('click', reloadToFirstPage);
        headerLeft.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                reloadToFirstPage();
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
});
