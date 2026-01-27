// 음악 인식 기능
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let permissionDenied = false; // 권한 거부 상태 추적

const recognitionBtn = document.getElementById('recognition-btn');
const recognitionStatus = document.getElementById('recognition-status');
const recognitionResult = document.getElementById('recognition-result');
const resultTitle = document.getElementById('result-title');
const resultArtist = document.getElementById('result-artist');
const resultThumbnail = document.getElementById('result-thumbnail');

recognitionBtn.addEventListener('click', async () => {
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
    // 권한이 이미 거부된 경우 - 중복 메시지 방지
    if (permissionDenied) {
        // 이미 안내 메시지가 표시되어 있으면 그대로 유지 (아무것도 하지 않음)
        if (recognitionStatus.innerHTML && recognitionStatus.innerHTML.includes('브라우저 설정')) {
            return; // 중복 메시지 방지
        }
    }
    
    // 먼저 권한 상태 확인
    let permissionStatus = 'prompt';
    try {
        if (navigator.permissions && navigator.permissions.query) {
            const result = await navigator.permissions.query({ name: 'microphone' });
            permissionStatus = result.state;
            console.log('Microphone permission status:', permissionStatus);
            
            // 이미 거부된 경우
            if (result.state === 'denied') {
                permissionDenied = true;
                recognitionStatus.innerHTML = '마이크 권한이 거부되었습니다.<br><br>주소창 왼쪽의 🔒 아이콘을 눌러 마이크 권한을 허용해주세요.<br><br><button onclick="openBrowserSettings()" style="margin-top: 8px; padding: 10px 20px; background: #FF0000; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold;">설정 방법 보기</button>';
                return;
            }
        }
    } catch (e) {
        console.log('Permission query not supported, proceeding...');
    }
    
    // 먼저 UI 상태 변경 (권한 요청 전에)
    isRecording = true;
    recognitionBtn.classList.add('recording');
    recognitionStatus.textContent = '마이크 권한 요청 중...';
    recognitionResult.style.display = 'none';
    
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
            
            // Blob 생성
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            // API 호출
            recognitionStatus.textContent = '인식 중...';
            
            try {
                const result = await recognizeMusic(audioBlob);
                
                // 결과 표시
                resultTitle.textContent = result.title || '제목 없음';
                resultArtist.textContent = result.artist || '아티스트 없음';
                
                // YouTube 검색으로 썸네일 가져오기
                try {
                    const searchResults = await searchYouTube(`${result.title} ${result.artist}`, 1);
                    if (searchResults.items && searchResults.items.length > 0) {
                        resultThumbnail.src = searchResults.items[0].snippet.thumbnails.medium.url;
                    }
                } catch (e) {
                    console.error('썸네일 가져오기 실패:', e);
                }
                
                recognitionResult.style.display = 'block';
                recognitionStatus.textContent = '인식 완료!';
                
                // 메모리 정리
                URL.revokeObjectURL(audioBlob);
                audioBlob = null;
                
            } catch (error) {
                console.error('인식 실패:', error);
                recognitionStatus.textContent = '인식에 실패했습니다. 다시 시도해주세요.';
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
                recognitionStatus.innerHTML = '마이크 권한이 거부되었습니다.<br><br>주소창 왼쪽의 🔒 아이콘을 눌러 마이크 권한을 허용해주세요.<br><br><button onclick="openBrowserSettings()" style="margin-top: 8px; padding: 10px 20px; background: #FF0000; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold;">설정 방법 보기</button>';
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

function stopRecognition() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        recognitionBtn.classList.remove('recording');
        
        // 아이콘 변경 (stop -> mic)
        const micIcon = document.getElementById('mic-icon');
        const stopIcon = document.getElementById('stop-icon');
        console.log('Restoring icon - micIcon:', micIcon, 'stopIcon:', stopIcon);
        if (micIcon) {
            micIcon.style.display = 'block';
            console.log('Mic icon shown');
        }
        if (stopIcon) {
            stopIcon.style.display = 'none';
            console.log('Stop icon hidden');
        }
    } else if (isRecording) {
        // 녹음이 시작되지 않았지만 isRecording이 true인 경우
        isRecording = false;
        recognitionBtn.classList.remove('recording');
        
        const micIcon = document.getElementById('mic-icon');
        const stopIcon = document.getElementById('stop-icon');
        if (micIcon) {
            micIcon.style.display = 'block';
        }
        if (stopIcon) {
            stopIcon.style.display = 'none';
        }
    }
}
