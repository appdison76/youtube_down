import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import {
  initDatabase,
  getFavorites,
  getPins,
  addFavorite,
  assignPinToFavorite,
  insertPin,
} from './database';

const EXPORT_VERSION = 1;
const EXPORT_FILENAME = 'youtube_down_backup.json';

/**
 * 내보내기: 찜하기(즐겨찾기), 찜하기그룹(핀)만 JSON으로 만들어 파일로 저장 후 공유
 */
export const exportData = async () => {
  await initDatabase();
  const [favorites, pins] = await Promise.all([
    getFavorites(),
    getPins(),
  ]);

  const payload = {
    version: EXPORT_VERSION,
    app: 'YouTube Down',
    exportedAt: new Date().toISOString(),
    favorites: favorites.map((f) => ({
      video_id: f.video_id,
      title: f.title,
      url: f.url,
      thumbnail: f.thumbnail || '',
      author: f.author || '',
      author_url: f.author_url || '',
      created_at: f.created_at,
      pin_ids: f.pin_ids || [],
      pin_names: f.pin_names || [],
    })),
    pins: (pins || []).map((p) => ({
      pin_id: p.pin_id,
      pin_name: p.pin_name,
      created_at: p.created_at,
    })),
  };

  const json = JSON.stringify(payload, null, 2);
  const dir = FileSystem.cacheDirectory;
  const path = `${dir}${EXPORT_FILENAME}`;
  await FileSystem.writeAsStringAsync(path, json, { encoding: 'utf8' });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    return { success: false, path, shared: false, error: 'Sharing not available' };
  }
  await Sharing.shareAsync(path, {
    mimeType: 'application/json',
    dialogTitle: '찜하기 백업 저장',
  });
  return { success: true, path, shared: true };
};

/**
 * 가져오기: 선택한 JSON 파일을 읽어 DB에 병합
 */
export const importData = async (fileUri) => {
  if (!fileUri) throw new Error('No file selected');
  const content = await FileSystem.readAsStringAsync(fileUri, { encoding: 'utf8' });
  const data = JSON.parse(content);

  if (!data.app || data.app !== 'YouTube Down') {
    throw new Error('Invalid backup file (not YouTube Down)');
  }

  await initDatabase();

  const pins = data.pins || [];
  const favorites = data.favorites || [];

  for (const p of pins) {
    await insertPin(p.pin_id, p.pin_name, p.created_at);
  }

  for (const f of favorites) {
    await addFavorite({
      id: f.video_id,
      title: f.title,
      url: f.url,
      thumbnail: f.thumbnail,
      author: f.author,
      authorUrl: f.author_url,
    });
    const pinIds = f.pin_ids || [];
    const pinNames = f.pin_names || [];
    if (pinIds.length > 0) {
      const pinDataArray = pinIds.map((id, i) => ({
        pin_id: id,
        pin_name: pinNames[i] || id,
      }));
      await assignPinToFavorite(f.video_id, pinDataArray);
    }
  }

  return {
    success: true,
    counts: { pins: pins.length, favorites: favorites.length },
  };
};

/**
 * 사용자가 파일을 선택하면 해당 파일 URI로 importData 호출
 */
export const pickAndImport = async () => {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return { canceled: true };
  }
  const uri = result.assets[0].uri;
  return importData(uri);
};
