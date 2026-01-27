/**
 * 요청 로그 – 리스타트 후에도 확인 가능하도록 파일 저장
 *
 * - LOG_DIR 환경변수 있으면: 해당 경로에 requests.log 저장 (Railway Volume 권장)
 * - 메모리에도 최근 500건 유지 → GET /api/admin/requests 로 조회
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || null;
const LOG_PATH = LOG_DIR ? path.join(LOG_DIR, 'requests.log') : null;
const MAX_MEMORY = 500;
// 파일 로그 크기 제한 (기본 10MB, 환경변수로 변경 가능)
const MAX_LOG_SIZE = parseInt(process.env.MAX_LOG_SIZE_MB || '10', 10) * 1024 * 1024; // MB → bytes

const memoryLog = [];

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = forwarded.split(',')[0];
    if (first) return first.trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function shouldLog(pathname) {
  if (!pathname || !pathname.startsWith('/api/')) return false;
  if (pathname.startsWith('/api/admin')) return false;
  if (pathname === '/api/test-ip' || pathname === '/health') return false;
  return (
    pathname.startsWith('/api/download/') ||
    pathname === '/api/video-info' ||
    pathname === '/api/search'
  );
}

/** 파일 크기 체크 및 오래된 로그 삭제 */
function rotateLogIfNeeded() {
  if (!LOG_PATH || !fs.existsSync(LOG_PATH)) return;
  try {
    const stats = fs.statSync(LOG_PATH);
    if (stats.size <= MAX_LOG_SIZE) return; // 제한 내
    
    // 파일 크기 초과 → 오래된 라인 삭제 (최근 50%만 유지)
    const raw = fs.readFileSync(LOG_PATH, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const keepLines = Math.floor(lines.length * 0.5); // 최근 50%만 유지
    const newContent = lines.slice(-keepLines).join('\n') + '\n';
    fs.writeFileSync(LOG_PATH, newContent, 'utf8');
    console.log(`[RequestLogger] 로그 파일 크기 초과 → 오래된 로그 삭제 (${lines.length} → ${keepLines} 라인)`);
  } catch (e) {
    console.error('[RequestLogger] rotate failed:', e.message);
  }
}

function appendFile(line) {
  if (!LOG_PATH) return;
  try {
    // 파일 크기 체크 (100번 중 1번만, 성능 고려)
    if (Math.random() < 0.01) rotateLogIfNeeded();
    fs.appendFileSync(LOG_PATH, line + '\n', 'utf8');
  } catch (e) {
    console.error('[RequestLogger] append failed:', e.message);
  }
}

function logRequest(req, extra = {}) {
  const pathname = req.path || req.url?.split('?')[0] || '';
  if (!shouldLog(pathname)) return;

  const at = new Date().toISOString();
  const ip = getClientIp(req);
  const method = req.method || 'GET';
  const q = req.query?.url ? { url: req.query.url } : {};
  const body = req.body && (req.body.url || req.body.q) ? { url: req.body.url, q: req.body.q } : {};
  const payload = { at, ip, method, path: pathname, ...q, ...body, ...extra };

  const line = JSON.stringify(payload);
  memoryLog.push(payload);
  if (memoryLog.length > MAX_MEMORY) memoryLog.shift();
  appendFile(line);
}

function getRecent(limit = 100) {
  const n = Math.min(Number(limit) || 100, MAX_MEMORY);
  return memoryLog.slice(-n).reverse();
}

/** 리스타트 후 파일 로그 조회 (LOG_PATH 있을 때만) */
function getRecentFromFile(limit = 200, fromDate = null, toDate = null) {
  if (!LOG_PATH || !fs.existsSync(LOG_PATH)) return [];
  try {
    const raw = fs.readFileSync(LOG_PATH, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    
    // 날짜 필터링
    let parsed = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
    
    // 날짜 범위 필터
    if (fromDate || toDate) {
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      parsed = parsed.filter((entry) => {
        if (!entry.at) return false;
        const entryDate = new Date(entry.at);
        if (from && entryDate < from) return false;
        if (to && entryDate > to) return false;
        return true;
      });
    }
    
    // 최신순 정렬 (최신이 앞)
    parsed.sort((a, b) => {
      const dateA = new Date(a.at || 0);
      const dateB = new Date(b.at || 0);
      return dateB - dateA;
    });
    
    const n = Math.min(Number(limit) || 200, parsed.length);
    return parsed.slice(0, n);
  } catch (e) {
    console.error('[RequestLogger] read failed:', e.message);
    return [];
  }
}

function middleware(req, res, next) {
  logRequest(req);
  next();
}

module.exports = { logRequest, getRecent, getRecentFromFile, middleware, LOG_PATH, LOG_DIR, MAX_LOG_SIZE };
