// 앱 메인 로직 - 페이지 전환
document.addEventListener('DOMContentLoaded', () => {
    // PRO 설치 배너 링크: 로컬은 8000 포트, 배포는 GitHub Pages
    const banner = document.getElementById('pro-install-banner');
    if (banner) {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        banner.href = isLocal
            ? 'http://localhost:8000/install-page/'
            : 'https://appdison76.github.io/youtube_down/install-page/';
    }

    const navTabs = document.querySelectorAll('.nav-tab');
    const pages = document.querySelectorAll('.page');
    
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
