import * as SQLite from 'expo-sqlite';

let db = null;
let initPromise = null;
let isInitialized = false;

// 데이터베이스 초기화 및 열기
const getDatabase = async () => {
  // 이미 초기화된 경우 바로 반환
  if (db && isInitialized) {
    return db;
  }
  
  // 초기화 중이면 기다림
  if (initPromise) {
    await initPromise;
    return db;
  }
  
  // 초기화 시작
  initPromise = (async () => {
    try {
      if (!db) {
        db = await SQLite.openDatabaseAsync('youtube_downloader.db');
      }
      // 테이블 생성 확인
      if (!isInitialized) {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            thumbnail TEXT,
            author TEXT,
            author_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);
        isInitialized = true;
        console.log('[Database] Database initialized');
      }
    } catch (error) {
      console.error('[Database] Error initializing database:', error);
      initPromise = null;
      throw error;
    }
  })();
  
  await initPromise;
  return db;
};

// 데이터베이스 초기화
export const initDatabase = async () => {
  try {
    await getDatabase(); // getDatabase가 초기화를 처리함
    console.log('[Database] Database initialized');
  } catch (error) {
    console.error('[Database] Error initializing database:', error);
    throw error;
  }
};

// 즐겨찾기 추가
export const addFavorite = async (video) => {
  try {
    const database = await getDatabase(); // 초기화 보장
    if (!database) {
      throw new Error('Database not initialized');
    }
    await database.runAsync(
      `INSERT OR REPLACE INTO favorites (video_id, title, url, thumbnail, author, author_url)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [
        video.id,
        video.title,
        video.url,
        video.thumbnail || '',
        video.author || '',
        video.authorUrl || '',
      ]
    );
    console.log('[Database] Favorite added:', video.id);
  } catch (error) {
    console.error('[Database] Error adding favorite:', error);
    throw error;
  }
};

// 즐겨찾기 삭제
export const removeFavorite = async (videoId) => {
  try {
    const database = await getDatabase(); // 초기화 보장
    if (!database) {
      throw new Error('Database not initialized');
    }
    await database.runAsync(
      `DELETE FROM favorites WHERE video_id = ?;`,
      [videoId]
    );
    console.log('[Database] Favorite removed:', videoId);
  } catch (error) {
    console.error('[Database] Error removing favorite:', error);
    throw error;
  }
};

// 즐겨찾기 목록 조회
export const getFavorites = async () => {
  try {
    const database = await getDatabase(); // 초기화 보장
    if (!database) {
      throw new Error('Database not initialized');
    }
    const result = await database.getAllAsync(
      `SELECT * FROM favorites ORDER BY created_at DESC;`
    );
    console.log('[Database] Favorites retrieved:', result.length);
    return result;
  } catch (error) {
    console.error('[Database] Error getting favorites:', error);
    throw error;
  }
};

// 즐겨찾기 여부 확인
export const isFavorite = async (videoId) => {
  try {
    const database = await getDatabase(); // 초기화 보장
    if (!database) {
      console.warn('[Database] Database not initialized, returning false');
      return false;
    }
    const result = await database.getFirstAsync(
      `SELECT COUNT(*) as count FROM favorites WHERE video_id = ?;`,
      [videoId]
    );
    return result && result.count > 0;
  } catch (error) {
    console.error('[Database] Error checking favorite:', error);
    // 오류 발생 시 false 반환 (앱이 계속 작동하도록)
    return false;
  }
};
