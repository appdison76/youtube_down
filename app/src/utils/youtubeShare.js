/**
 * 유튜브 공유 인텐트 / 딥링크용 (AppNavigator, SearchScreen, downloadService 공통)
 * — shorts / live / watch / youtu.be → 내비·oEmbed·다운로드용 표준 URL
 */

/** 공유 텍스트에서 유튜브 URL 한 덩어리 추출 (선택 사용) */
export const YOUTUBE_URL_IN_TEXT =
  /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=[^&\s]+|shorts\/[^?\s]+|live\/[^?\s]+)|youtu\.be\/[^?\s]+)/i;

export function extractYoutubeUrlFromShare(text) {
  if (!text || typeof text !== 'string') return '';
  const t = text.trim();
  const m = t.match(YOUTUBE_URL_IN_TEXT);
  if (m) return m[0].trim();
  if (/youtu\.be|youtube\.com/i.test(t)) {
    const parts = t.split(/\s+/);
    const hit = parts.find((p) => /youtu\.be|youtube\.com/i.test(p));
    if (hit) return hit.trim();
  }
  return t;
}

export function normalizeYouTubeShareUrl(url) {
  if (!url || typeof url !== 'string') return url;
  try {
    const u = new URL(url);
    u.searchParams.delete('si');
    return u.toString();
  } catch {
    return url.trim();
  }
}

/** watch / live / shorts → Import·oEmbed·다운로드 API용 표준 URL */
export function normalizeYoutubeNavigationUrl(urlToNavigate) {
  let u = (urlToNavigate || '').trim();
  if (!u) return u;

  if (u.startsWith('exp+app://') || u.startsWith('exp://')) {
    try {
      const urlObj = new URL(u);
      const p = urlObj.searchParams.get('url');
      if (p) u = decodeURIComponent(p);
    } catch {
      const urlMatch = u.match(/[?&]url=([^&]+)/);
      if (urlMatch) u = decodeURIComponent(urlMatch[1]);
    }
  }

  if (u.startsWith(':om/') || u.startsWith('om/') || u.startsWith('be.com/')) {
    u = u.startsWith('be.com/') ? `https://www.youtu${u}` : `https://www.youtub${u}`;
  }

  const watchMatch = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s?]+)/);
  const liveMatch = u.match(/youtube\.com\/live\/([^&\s?]+)/);
  const shortsMatch = u.match(/youtube\.com\/shorts\/([^&\s/?]+)/);

  if (watchMatch) {
    const videoId = watchMatch[1].split('?')[0].split('&')[0];
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
  if (liveMatch) {
    const liveId = liveMatch[1].split('?')[0].split('&')[0];
    return `https://www.youtube.com/live/${liveId}`;
  }
  if (shortsMatch) {
    const sid = shortsMatch[1].split('?')[0].split('&')[0];
    return `https://www.youtube.com/watch?v=${sid}`;
  }
  return u;
}
