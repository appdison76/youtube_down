import * as SQLite from 'expo-sqlite';

let db = null;
let initPromise = null;
let isInitialized = false;

// 데이터베이스 초기화 및 열기
const getDatabase = async () => {
  if (db && isInitialized) {
    return db;
  }
  
  if (initPromise) {
    await initPromise;
    return db;
  }
  
  initPromise = (async () => {
    try {
      if (!db) {
        db = await SQLite.openDatabaseAsync('video_downloader.db');
      }
      if (!isInitialized) {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS playlists (
            playlist_id TEXT PRIMARY KEY,
            playlist_name TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
          );
          
          CREATE TABLE IF NOT EXISTS files_playlists (
            file_uri TEXT NOT NULL,
            playlist_id TEXT NOT NULL,
            PRIMARY KEY (file_uri, playlist_id),
            FOREIGN KEY (playlist_id) REFERENCES playlists(playlist_id) ON DELETE CASCADE
          );
          
          CREATE INDEX IF NOT EXISTS idx_files_playlists_file ON files_playlists(file_uri);
          CREATE INDEX IF NOT EXISTS idx_files_playlists_playlist ON files_playlists(playlist_id);
        `);
        isInitialized = true;
        console.log('[PlaylistService] Database initialized');
      }
    } catch (error) {
      console.error('[PlaylistService] Error initializing database:', error);
      initPromise = null;
      throw error;
    }
  })();
  
  await initPromise;
  return db;
};

// 플레이리스트 목록 가져오기
export const getPlaylists = async () => {
  try {
    const database = await getDatabase();
    if (!database) {
      throw new Error('Database not initialized');
    }
    const playlists = await database.getAllAsync(
      'SELECT playlist_id, playlist_name, created_at FROM playlists ORDER BY created_at DESC'
    );
    return playlists;
  } catch (error) {
    console.error('[PlaylistService] Error getting playlists:', error);
    return [];
  }
};

// 플레이리스트 생성
export const createPlaylist = async (playlistName) => {
  try {
    const database = await getDatabase();
    if (!database) {
      throw new Error('Database not initialized');
    }
    const playlistId = `playlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await database.runAsync(
      'INSERT INTO playlists (playlist_id, playlist_name, created_at) VALUES (?, ?, strftime("%s", "now"))',
      [playlistId, playlistName]
    );
    console.log('[PlaylistService] Playlist created:', playlistId);
    return playlistId;
  } catch (error) {
    console.error('[PlaylistService] Error creating playlist:', error);
    throw error;
  }
};

// 플레이리스트 이름 수정
export const updatePlaylist = async (playlistId, newPlaylistName) => {
  try {
    const database = await getDatabase();
    if (!database) {
      throw new Error('Database not initialized');
    }
    await database.runAsync(
      'UPDATE playlists SET playlist_name = ? WHERE playlist_id = ?',
      [newPlaylistName, playlistId]
    );
    console.log('[PlaylistService] Playlist updated:', playlistId);
  } catch (error) {
    console.error('[PlaylistService] Error updating playlist:', error);
    throw error;
  }
};

// 플레이리스트 삭제
export const deletePlaylist = async (playlistId) => {
  try {
    const database = await getDatabase();
    if (!database) {
      throw new Error('Database not initialized');
    }
    await database.runAsync(
      'DELETE FROM playlists WHERE playlist_id = ?',
      [playlistId]
    );
    console.log('[PlaylistService] Playlist deleted:', playlistId);
  } catch (error) {
    console.error('[PlaylistService] Error deleting playlist:', error);
    throw error;
  }
};

// 파일을 플레이리스트에 할당
export const assignFileToPlaylist = async (fileUri, playlistDataArray) => {
  try {
    const database = await getDatabase();
    if (!database) {
      throw new Error('Database not initialized');
    }
    
    // 기존 플레이리스트 관계 제거
    await database.runAsync(
      'DELETE FROM files_playlists WHERE file_uri = ?',
      [fileUri]
    );

    // 새 플레이리스트 관계 추가
    for (const playlistData of playlistDataArray) {
      const { playlist_id, playlist_name } = playlistData;
      
      // playlist_name이 없으면 스킵
      if (!playlist_name || playlist_name.trim() === '') {
        console.warn('[PlaylistService] Skipping playlist with empty name:', playlist_id);
        continue;
      }
      
      // 플레이리스트가 없으면 생성
      const existingPlaylist = await database.getFirstAsync(
        'SELECT playlist_id, playlist_name FROM playlists WHERE playlist_id = ?',
        [playlist_id]
      );
      
      if (!existingPlaylist) {
        await database.runAsync(
          'INSERT INTO playlists (playlist_id, playlist_name, created_at) VALUES (?, ?, strftime("%s", "now"))',
          [playlist_id, playlist_name.trim()]
        );
      } else if (existingPlaylist.playlist_name !== playlist_name.trim()) {
        // 플레이리스트 이름이 다르면 업데이트
        await database.runAsync(
          'UPDATE playlists SET playlist_name = ? WHERE playlist_id = ?',
          [playlist_name.trim(), playlist_id]
        );
      }
      
      // 파일-플레이리스트 관계 추가
      await database.runAsync(
        'INSERT OR IGNORE INTO files_playlists (file_uri, playlist_id) VALUES (?, ?)',
        [fileUri, playlist_id]
      );
    }
    
    console.log('[PlaylistService] File assigned to playlists:', fileUri);
  } catch (error) {
    console.error('[PlaylistService] Error assigning file to playlist:', error);
    throw error;
  }
};

// 파일의 플레이리스트 목록 가져오기
export const getPlaylistsForFile = async (fileUri) => {
  try {
    const database = await getDatabase();
    if (!database) {
      throw new Error('Database not initialized');
    }
    if (!fileUri) {
      console.warn('[PlaylistService] getPlaylistsForFile called with empty fileUri');
      return [];
    }
    
    // getAllAsync는 SQL 문자열과 파라미터 배열을 받음
    const playlists = await database.getAllAsync(
      `SELECT p.playlist_id, p.playlist_name 
       FROM playlists p
       INNER JOIN files_playlists fp ON p.playlist_id = fp.playlist_id
       WHERE fp.file_uri = ?`,
      [fileUri]
    );
    
    return (playlists || []).map(p => ({
      playlist_id: p.playlist_id,
      playlist_name: p.playlist_name,
    }));
  } catch (error) {
    console.error('[PlaylistService] Error getting playlists for file:', error);
    // 오류 발생 시 빈 배열 반환 (앱이 계속 작동하도록)
    return [];
  }
};
