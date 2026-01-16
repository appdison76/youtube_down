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
        db = await SQLite.openDatabaseAsync('video_downloader.db');
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
          
          CREATE TABLE IF NOT EXISTS pins (
            pin_id TEXT PRIMARY KEY,
            pin_name TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
          );
          
          CREATE TABLE IF NOT EXISTS favorites_pins (
            favorite_id TEXT NOT NULL,
            pin_id TEXT NOT NULL,
            PRIMARY KEY (favorite_id, pin_id),
            FOREIGN KEY (favorite_id) REFERENCES favorites(video_id) ON DELETE CASCADE,
            FOREIGN KEY (pin_id) REFERENCES pins(pin_id) ON DELETE CASCADE
          );
          
          CREATE INDEX IF NOT EXISTS idx_favorites_added_at ON favorites(created_at);
          CREATE INDEX IF NOT EXISTS idx_favorites_pins_favorite ON favorites_pins(favorite_id);
          CREATE INDEX IF NOT EXISTS idx_favorites_pins_pin ON favorites_pins(pin_id);
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
    const favorites = await database.getAllAsync(`
      SELECT 
        f.video_id,
        f.title,
        f.url,
        f.thumbnail,
        f.author,
        f.author_url,
        f.created_at,
        GROUP_CONCAT(fp.pin_id) as pin_ids,
        GROUP_CONCAT(p.pin_name) as pin_names
      FROM favorites f
      LEFT JOIN favorites_pins fp ON f.video_id = fp.favorite_id
      LEFT JOIN pins p ON fp.pin_id = p.pin_id
      GROUP BY f.video_id
      ORDER BY f.created_at DESC
    `);
    
    // pin_ids와 pin_names를 배열로 변환
    return favorites.map(fav => {
      let pin_ids = fav.pin_ids ? fav.pin_ids.split(',') : [];
      let pin_names = fav.pin_names ? fav.pin_names.split(',') : [];
      
      // 핵심 수정: pin_names가 비어있으면 pin_ids도 비워야 함 (삭제된 핀 제거)
      // 삭제된 핀의 경우 pin_ids는 있지만 pin_names가 NULL이므로 동기화 필요
      if (pin_names.length === 0) {
        pin_ids = [];
      }
      
      return {
        ...fav,
        pin_ids,
        pin_names,
      };
    });
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

// 핀 목록 가져오기
export const getPins = async () => {
  try {
    const database = await getDatabase();
    if (!database) {
      throw new Error('Database not initialized');
    }
    const pins = await database.getAllAsync(
      'SELECT pin_id, pin_name, created_at FROM pins ORDER BY created_at DESC'
    );
    return pins;
  } catch (error) {
    console.error('[Database] Error getting pins:', error);
    return [];
  }
};

// 핀 생성
export const createPin = async (pinName) => {
  try {
    const database = await getDatabase();
    if (!database) {
      throw new Error('Database not initialized');
    }
    const pinId = `pin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await database.runAsync(
      'INSERT INTO pins (pin_id, pin_name, created_at) VALUES (?, ?, strftime("%s", "now"))',
      [pinId, pinName]
    );
    console.log('[Database] Pin created:', pinId, pinName);
    return pinId;
  } catch (error) {
    console.error('[Database] Error creating pin:', error);
    throw error;
  }
};

// 핀에 즐겨찾기 할당
export const assignPinToFavorite = async (videoId, pinDataArray) => {
  try {
    const database = await getDatabase();
    if (!database) {
      throw new Error('Database not initialized');
    }
    
    // 기존 핀 관계 제거
    await database.runAsync(
      'DELETE FROM favorites_pins WHERE favorite_id = ?',
      [videoId]
    );

    // 새 핀 관계 추가
    for (const pinData of pinDataArray) {
      const { pin_id, pin_name } = pinData;
      
      // 핀이 없으면 생성
      const existingPin = await database.getFirstAsync(
        'SELECT pin_id FROM pins WHERE pin_id = ?',
        [pin_id]
      );
      
      if (!existingPin) {
        await database.runAsync(
          'INSERT INTO pins (pin_id, pin_name, created_at) VALUES (?, ?, strftime("%s", "now"))',
          [pin_id, pin_name]
        );
      }

      // 관계 추가
      await database.runAsync(
        'INSERT OR IGNORE INTO favorites_pins (favorite_id, pin_id) VALUES (?, ?)',
        [videoId, pin_id]
      );
    }

    console.log('[Database] Pins assigned to favorite:', videoId);
  } catch (error) {
    console.error('[Database] Error assigning pins:', error);
    throw error;
  }
};

// 즐겨찾기에서 핀 제거
export const removePinFromFavorite = async (videoId, pinId) => {
  try {
    const database = await getDatabase();
    if (!database) {
      throw new Error('Database not initialized');
    }
    
    await database.runAsync(
      'DELETE FROM favorites_pins WHERE favorite_id = ? AND pin_id = ?',
      [videoId, pinId]
    );

    console.log('[Database] Pin removed from favorite:', videoId, pinId);
  } catch (error) {
    console.error('[Database] Error removing pin from favorite:', error);
    throw error;
  }
};

// 핀 삭제
export const deletePin = async (pinId) => {
  try {
    const database = await getDatabase();
    if (!database) {
      throw new Error('Database not initialized');
    }
    
    await database.runAsync(
      'DELETE FROM pins WHERE pin_id = ?',
      [pinId]
    );

    console.log('[Database] Pin deleted:', pinId);
  } catch (error) {
    console.error('[Database] Error deleting pin:', error);
    throw error;
  }
};

// 핀 이름 업데이트
export const updatePinName = async (pinId, newName) => {
  try {
    const database = await getDatabase();
    if (!database) {
      throw new Error('Database not initialized');
    }
    
    await database.runAsync(
      'UPDATE pins SET pin_name = ? WHERE pin_id = ?',
      [newName, pinId]
    );

    console.log('[Database] Pin name updated:', pinId, newName);
  } catch (error) {
    console.error('[Database] Error updating pin name:', error);
    throw error;
  }
};
