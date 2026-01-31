// 음악 인식 기능
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isRecognizing = false; // API 호출 중(인식 중...) — 이때는 버튼 비활성
let permissionDenied = false; // 권한 거부 상태 추적
let permissionCheckInterval = null; // 권한 상태 주기적 확인

const recognitionBtn = document.getElementById('recognition-btn');
const recognitionStatus = document.getElementById('recognition-status');
const recognitionResult = document.getElementById('recognition-result');
const resultTitle = document.getElementById('result-title');
const resultArtist = document.getElementById('result-artist');
const resultAlbum = document.getElementById('result-album');
const resultThumbnail = document.getElementById('result-thumbnail');
const recognitionYoutubeArea = document.getElementById('recognition-youtube-area');
const recognitionYoutubeResults = document.getElementById('recognition-youtube-results');

recognitionBtn.addEventListener('click', async () => {
    if (isRecognizing) return; // 인식 중에는 무시 (아이콘 눌러도 반응 없음)
    console.log('Button clicked, isRecording:', isRecording);
    if (isRecording) {
        console.log('Stopping recognition...');
        stopRecognition();
    } else {
        console.log('Starting recognition...');
        startRecognition();
    }
});

async function startRecognition() {
    // 먼저 권한 상태를 다시 확인 (설정에서 변경했을 수 있으므로)
    let permissionStatus = 'prompt';
    
    try {
        if (navigator.permissions && navigator.permissions.query) {
            const result = await navigator.permissions.query({ name: 'microphone' });
            permissionStatus = result.state;
            console.log('Microphone permission status:', permissionStatus);
            
            // 권한 상태에 따라 플래그 업데이트
            if (result.state === 'denied') {
                permissionDenied = true;
                // 권한이 거부된 경우에도 getUserMedia를 시도해볼 수 있도록 함
                // (사용자가 설정에서 권한을 변경했을 수 있으므로)
                // 메시지는 getUserMedia 실패 후에만 표시
                console.log('Permission denied, but will try getUserMedia anyway');
            } else if (result.state === 'granted') {
                // 권한이 허용된 경우 플래그 리셋
                permissionDenied = false;
                shouldProceed = true;
            }
            
            // 권한 상태 변경 감지 리스너 추가
            result.onchange = () => {
                console.log('Permission state changed to:', result.state);
                if (result.state === 'granted') {
                    permissionDenied = false;
                    // 주기적 확인 중지
                    if (permissionCheckInterval) {
                        clearInterval(permissionCheckInterval);
                        permissionCheckInterval = null;
                    }
                    // 상태 메시지 업데이트 및 재시도 버튼 표시
                    if (recognitionStatus.innerHTML && (recognitionStatus.innerHTML.includes('브라우저 설정') || recognitionStatus.innerHTML.includes('권한이 거부'))) {
                        recognitionStatus.innerHTML = '✅ 마이크 권한이 허용되었습니다!<br><br><button onclick="window.startRecognition()" style="margin-top: 8px; padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold;">지금 시작하기</button>';
                    }
                } else if (result.state === 'denied') {
                    permissionDenied = true;
                }
            };
            
            // 권한이 거부된 경우 주기적으로 상태 확인 (5초마다)
            if (result.state === 'denied') {
                if (permissionCheckInterval) {
                    clearInterval(permissionCheckInterval);
                }
                permissionCheckInterval = setInterval(async () => {
                    try {
                        const checkResult = await navigator.permissions.query({ name: 'microphone' });
                        if (checkResult.state === 'granted') {
                            permissionDenied = false;
                            clearInterval(permissionCheckInterval);
                            permissionCheckInterval = null;
                            if (recognitionStatus.innerHTML && (recognitionStatus.innerHTML.includes('브라우저 설정') || recognitionStatus.innerHTML.includes('권한이 거부'))) {
                                recognitionStatus.innerHTML = '✅ 마이크 권한이 허용되었습니다!<br><br><button onclick="window.startRecognition()" style="margin-top: 8px; padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold;">지금 시작하기</button>';
                            }
                        }
                    } catch (e) {
                        console.log('Permission check failed:', e);
                    }
                }, 5000); // 5초마다 확인
            }
        }
    } catch (e) {
        console.log('Permission query not supported, proceeding...');
        // 권한 API를 지원하지 않는 경우 플래그 리셋하고 진행
        permissionDenied = false;
    }
    
    // 먼저 UI 상태 변경 (권한 요청 전에)
    isRecording = true;
    recognitionBtn.classList.add('recording');
    recognitionStatus.textContent = '마이크 권한 요청 중...';
    recognitionResult.style.display = 'none';
    if (recognitionYoutubeArea) recognitionYoutubeArea.style.display = 'none';
    if (recognitionYoutubeResults) recognitionYoutubeResults.innerHTML = '';
    
    // 아이콘 변경 (mic -> stop)
    const micIcon = document.getElementById('mic-icon');
    const stopIcon = document.getElementById('stop-icon');
    console.log('Changing icon - micIcon:', micIcon, 'stopIcon:', stopIcon);
    if (micIcon) {
        micIcon.style.display = 'none';
        console.log('Mic icon hidden');
    }
    if (stopIcon) {
        stopIcon.style.display = 'block';
        console.log('Stop icon shown');
    }
    
    try {
        // 마이크 권한 요청
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // 권한 허용됨 - 플래그 리셋
        permissionDenied = false;
        recognitionStatus.textContent = '음악을 듣고 있습니다...';
        
        // 녹음 시작
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(track => track.stop());
            
            // 인식 중 상태: stop 아이콘 강제 유지, 버튼 클릭 무시
            isRecognizing = true;
            recognitionStatus.textContent = '인식 중...';
            const micIconEl = document.getElementById('mic-icon');
            const stopIconEl = document.getElementById('stop-icon');
            if (micIconEl) micIconEl.style.display = 'none';
            if (stopIconEl) stopIconEl.style.display = 'block';
            
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            try {
                const result = await recognizeMusic(audioBlob);
                
                // 결과 표시 (텍스트 선택 가능)
                resultTitle.textContent = result.title || '제목 없음';
                resultArtist.textContent = result.artist || '아티스트 없음';
                if (result.album) {
                    resultAlbum.textContent = result.album;
                    resultAlbum.style.display = 'block';
                } else {
                    resultAlbum.style.display = 'none';
                }
                
                // YouTube 검색 (10개) → 썸네일 + 다운로드할 영상 선택 목록
                try {
                    const searchResults = await searchYouTube(`${result.title} ${result.artist}`.trim(), 10);
                    if (searchResults.items && searchResults.items.length > 0) {
                        resultThumbnail.src = searchResults.items[0].snippet.thumbnails.medium.url;
                        resultThumbnail.style.display = 'block';
                        await renderRecognitionYouTubeResults(searchResults.items);
                        recognitionYoutubeArea.style.display = 'block';
                    } else {
                        resultThumbnail.style.display = 'none';
                        recognitionYoutubeArea.style.display = 'none';
                    }
                } catch (e) {
                    console.error('YouTube 검색 실패:', e);
                    resultThumbnail.style.display = 'none';
                    recognitionYoutubeArea.style.display = 'none';
                }
                
                recognitionResult.style.display = 'block';
                recognitionStatus.textContent = '인식 완료!';
                // 인식된 곡 제목까지만 보이도록 스크롤 (다운로드할 영상 선택까지 내려가지 않게)
                const scrollTarget = recognitionResult.querySelector('.section-title') || recognitionResult.querySelector('.recognition-result-card') || recognitionResult;
                scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
                
            } catch (error) {
                console.error('인식 실패:', error);
                recognitionStatus.textContent = '인식에 실패했습니다. 다시 시도해주세요.';
            } finally {
                isRecognizing = false;
                // 인식 끝나면 마이크 아이콘으로 복원
                const micIcon = document.getElementById('mic-icon');
                const stopIcon = document.getElementById('stop-icon');
                if (micIcon) micIcon.style.display = 'block';
                if (stopIcon) stopIcon.style.display = 'none';
                recognitionBtn.classList.remove('recording');
            }
        };
        
        // 10초 녹음
        mediaRecorder.start();
        setTimeout(() => {
            if (isRecording) {
                stopRecognition();
            }
        }, 10000);
        
    } catch (error) {
        console.error('마이크 권한 오류:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Current URL:', window.location.href);
        console.error('Is HTTPS:', window.location.protocol === 'https:');
        
        // 권한 거부 시 안내 메시지
        let errorMessage = '마이크 권한이 필요합니다.';
        const isHTTPS = window.location.protocol === 'https:';
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            permissionDenied = true; // 권한 거부 상태 저장
            
            if (!isHTTPS && !isLocalhost) {
                errorMessage = '모바일 브라우저에서는 HTTPS가 필요합니다.\n\n현재 HTTP로 접속 중입니다.\n\nGitHub Pages나 Netlify로 배포하면 HTTPS로 접속 가능합니다.';
            } else {
                // HTML로 버튼 포함
                errorMessage = null; // HTML 메시지 사용
                recognitionStatus.innerHTML = '마이크 권한이 거부되었습니다.<br><br><strong>해결 방법:</strong><br>브라우저 메뉴(⋮) → "사이트 설정" 또는 "권한" → "마이크" 허용<br><br><small style="color: #666;">💡 권한을 허용하면 자동으로 감지됩니다 (5초마다 확인)<br>또는 페이지를 새로고침하세요.</small><br><br><button onclick="openBrowserSettings()" style="margin-top: 8px; padding: 10px 20px; background: #FF0000; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold;">상세 설정 방법 보기</button><br><button onclick="location.reload()" style="margin-top: 8px; padding: 10px 20px; background: #2196F3; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold;">페이지 새로고침</button>';
            }
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            errorMessage = '마이크를 찾을 수 없습니다.';
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
            errorMessage = '마이크에 접근할 수 없습니다.\n\n다른 앱이 마이크를 사용 중일 수 있습니다.';
        } else if (error.name === 'NotSupportedError' || error.name === 'TypeError') {
            if (!isHTTPS && !isLocalhost) {
                errorMessage = '모바일 브라우저에서는 HTTPS가 필요합니다.\n\n현재 HTTP로 접속 중입니다.';
            } else {
                errorMessage = '마이크 기능을 사용할 수 없습니다.';
            }
        }
        
        if (errorMessage) {
            recognitionStatus.textContent = errorMessage;
        }
        // errorMessage가 null이면 이미 innerHTML로 설정됨
        isRecording = false;
        recognitionBtn.classList.remove('recording');
        
        // 아이콘 복원
        const micIcon = document.getElementById('mic-icon');
        const stopIcon = document.getElementById('stop-icon');
        if (micIcon) {
            micIcon.style.display = 'block';
            console.log('Mic icon restored');
        }
        if (stopIcon) {
            stopIcon.style.display = 'none';
            console.log('Stop icon hidden');
        }
    }
}

// 인식 후 YouTube 검색 결과 렌더링 (앱과 동일: 카드 클릭=재생, 찜 ☆/★, 영상=빨강/음악=초록)
async function renderRecognitionYouTubeResults(items) {
    if (!recognitionYoutubeResults || !items || items.length === 0) return;
    recognitionYoutubeResults.innerHTML = items.map(item => {
        const videoId = item.id && item.id.videoId ? item.id.videoId : item.id;
        if (!videoId) return '';
        const thumb = item.snippet && item.snippet.thumbnails ? (item.snippet.thumbnails.medium || item.snippet.thumbnails.default).url : '';
        const title = (item.snippet && item.snippet.title) || '';
        const channel = (item.snippet && item.snippet.channelTitle) || '';
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        return `
            <div class="youtube-result-card card-clickable" data-video-id="${videoId}" data-url="${url.replace(/"/g, '&quot;')}">
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
    recognitionYoutubeResults.querySelectorAll('.youtube-result-card.card-clickable').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const url = card.dataset.url;
            if (url) window.open(url, '_blank');
        });
    });
    // 찜 상태 표시 (비찜=☆, 찜=★ 노란 배경)
    for (const card of recognitionYoutubeResults.querySelectorAll('.youtube-result-card')) {
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
    recognitionYoutubeResults.querySelectorAll('.card-btn-download-video').forEach(btn => {
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
    recognitionYoutubeResults.querySelectorAll('.card-btn-download-audio').forEach(btn => {
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
    recognitionYoutubeResults.querySelectorAll('.card-btn-favorite').forEach(btn => {
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
}

// 전역 스코프에 함수 할당 (onclick에서 호출 가능하도록)
window.startRecognition = startRecognition;

function stopRecognition() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        recognitionBtn.classList.remove('recording');
        // 아이콘은 onstop 쪽에서 인식 끝난 뒤 mic으로 바꿈. 여기서 바꾸면 "인식 중..."일 때 마이크로 바뀌어서 사용자가 또 누르게 됨 → 바꾸지 않음
    } else if (isRecording) {
        isRecording = false;
        recognitionBtn.classList.remove('recording');
        const micIcon = document.getElementById('mic-icon');
        const stopIcon = document.getElementById('stop-icon');
        if (micIcon) micIcon.style.display = 'block';
        if (stopIcon) stopIcon.style.display = 'none';
    }
}
