// 앱 메인 로직 - 페이지 전환
document.addEventListener('DOMContentLoaded', () => {
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
