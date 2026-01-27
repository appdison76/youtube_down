// IndexedDB 관리
const DB_NAME = 'melodysnap';
const DB_VERSION = 1;
const STORE_NAME = 'library';

let db = null;

// 데이터베이스 초기화
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('type', 'type', { unique: false });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

// 항목 추가
async function addItem(item) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const itemWithTimestamp = {
            ...item,
            timestamp: Date.now(),
        };
        
        const request = store.put(itemWithTimestamp);
        request.onsuccess = () => resolve(itemWithTimestamp);
        request.onerror = () => reject(request.error);
    });
}

// 항목 삭제
async function removeItem(id) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// 모든 항목 가져오기
async function getAllItems(filter = 'all') {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => {
            let items = request.result;
            
            // 필터 적용
            if (filter === 'favorite') {
                items = items.filter(item => item.type === 'favorite');
            } else if (filter === 'downloaded') {
                items = items.filter(item => item.type === 'downloaded');
            }
            
            // 시간순 정렬 (최신순)
            items.sort((a, b) => b.timestamp - a.timestamp);
            
            resolve(items);
        };
        request.onerror = () => reject(request.error);
    });
}

// 항목 검색
async function searchItems(query) {
    if (!db) await initDB();
    
    const allItems = await getAllItems();
    const lowerQuery = query.toLowerCase();
    
    return allItems.filter(item => 
        item.title?.toLowerCase().includes(lowerQuery) ||
        item.artist?.toLowerCase().includes(lowerQuery) ||
        item.author?.toLowerCase().includes(lowerQuery)
    );
}

// 항목 존재 여부 확인
async function hasItem(id) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        
        request.onsuccess = () => resolve(!!request.result);
        request.onerror = () => reject(request.error);
    });
}
