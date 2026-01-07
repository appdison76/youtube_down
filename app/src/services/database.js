import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabase('youtube_downloader.db');

export const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      // 폴더 테이블
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS folders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        [],
        () => {
          // 기본 폴더 생성
          tx.executeSql(
            `SELECT id FROM folders WHERE name = '기본 찜하기'`,
            [],
            (_, { rows }) => {
              if (rows.length === 0) {
                tx.executeSql(
                  `INSERT INTO folders (name) VALUES ('기본 찜하기')`,
                  [],
                  () => resolve(),
                  (_, error) => reject(error)
                );
              } else {
                resolve();
              }
            },
            (_, error) => reject(error)
          );
        },
        (_, error) => reject(error)
      );

      // 찜하기 테이블
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS favorites (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          video_id TEXT NOT NULL,
          title TEXT NOT NULL,
          thumbnail TEXT,
          duration TEXT,
          folder_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (folder_id) REFERENCES folders(id)
        )`,
        [],
        () => resolve(),
        (_, error) => reject(error)
      );
    });
  });
};

// 폴더 관련
export const getFolders = () => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        `SELECT f.id, f.name, f.created_at, 
         COUNT(fav.id) as count
         FROM folders f
         LEFT JOIN favorites fav ON f.id = fav.folder_id
         GROUP BY f.id, f.name, f.created_at
         ORDER BY f.created_at DESC`,
        [],
        (_, { rows }) => {
          resolve(rows._array);
        },
        (_, error) => reject(error)
      );
    });
  });
};

export const createFolder = (name) => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        `INSERT INTO folders (name) VALUES (?)`,
        [name],
        (_, { insertId }) => resolve(insertId),
        (_, error) => reject(error)
      );
    });
  });
};

export const deleteFolder = (folderId) => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      // 기본 폴더 ID 가져오기
      tx.executeSql(
        `SELECT id FROM folders WHERE name = '기본 찜하기'`,
        [],
        (_, { rows }) => {
          const defaultFolderId = rows._array[0].id;
          
          // 폴더의 영상들을 기본 폴더로 이동
          tx.executeSql(
            `UPDATE favorites SET folder_id = ? WHERE folder_id = ?`,
            [defaultFolderId, folderId],
            () => {
              // 폴더 삭제
              tx.executeSql(
                `DELETE FROM folders WHERE id = ? AND name != '기본 찜하기'`,
                [folderId],
                (_, { rowsAffected }) => {
                  if (rowsAffected > 0) {
                    resolve();
                  } else {
                    reject(new Error('기본 폴더는 삭제할 수 없습니다'));
                  }
                },
                (_, error) => reject(error)
              );
            },
            (_, error) => reject(error)
          );
        },
        (_, error) => reject(error)
      );
    });
  });
};

// 찜하기 관련
export const getFavorites = (folderId = null) => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      const query = folderId
        ? `SELECT f.*, fo.name as folder_name 
           FROM favorites f
           LEFT JOIN folders fo ON f.folder_id = fo.id
           WHERE f.folder_id = ?
           ORDER BY f.created_at DESC`
        : `SELECT f.*, fo.name as folder_name 
           FROM favorites f
           LEFT JOIN folders fo ON f.folder_id = fo.id
           ORDER BY f.created_at DESC`;
      
      const params = folderId ? [folderId] : [];
      
      tx.executeSql(
        query,
        params,
        (_, { rows }) => resolve(rows._array),
        (_, error) => reject(error)
      );
    });
  });
};

export const addFavorite = (videoId, title, thumbnail, duration, folderId = null) => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      // 중복 확인
      tx.executeSql(
        `SELECT id FROM favorites WHERE video_id = ?`,
        [videoId],
        (_, { rows }) => {
          if (rows.length > 0) {
            reject(new Error('이미 찜한 영상입니다'));
            return;
          }

          // 기본 폴더 ID 가져오기
          if (!folderId) {
            tx.executeSql(
              `SELECT id FROM folders WHERE name = '기본 찜하기'`,
              [],
              (_, { rows }) => {
                const defaultFolderId = rows._array[0].id;
                insertFavorite(tx, videoId, title, thumbnail, duration, defaultFolderId, resolve, reject);
              },
              (_, error) => reject(error)
            );
          } else {
            insertFavorite(tx, videoId, title, thumbnail, duration, folderId, resolve, reject);
          }
        },
        (_, error) => reject(error)
      );
    });
  });
};

const insertFavorite = (tx, videoId, title, thumbnail, duration, folderId, resolve, reject) => {
  tx.executeSql(
    `INSERT INTO favorites (video_id, title, thumbnail, duration, folder_id)
     VALUES (?, ?, ?, ?, ?)`,
    [videoId, title, thumbnail || '', duration || '', folderId],
    (_, { insertId }) => resolve(insertId),
    (_, error) => reject(error)
  );
};

export const deleteFavorite = (favoriteId) => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        `DELETE FROM favorites WHERE id = ?`,
        [favoriteId],
        (_, { rowsAffected }) => {
          if (rowsAffected > 0) {
            resolve();
          } else {
            reject(new Error('찜하기를 찾을 수 없습니다'));
          }
        },
        (_, error) => reject(error)
      );
    });
  });
};

export const moveFavorite = (favoriteId, folderId) => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      if (!folderId) {
        // 기본 폴더로 이동
        tx.executeSql(
          `SELECT id FROM folders WHERE name = '기본 찜하기'`,
          [],
          (_, { rows }) => {
            const defaultFolderId = rows._array[0].id;
            updateFavoriteFolder(tx, favoriteId, defaultFolderId, resolve, reject);
          },
          (_, error) => reject(error)
        );
      } else {
        updateFavoriteFolder(tx, favoriteId, folderId, resolve, reject);
      }
    });
  });
};

const updateFavoriteFolder = (tx, favoriteId, folderId, resolve, reject) => {
  tx.executeSql(
    `UPDATE favorites SET folder_id = ? WHERE id = ?`,
    [folderId, favoriteId],
    () => resolve(),
    (_, error) => reject(error)
  );
};




