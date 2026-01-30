/**
 * 8000 포트 정적 서버: 웹앱(/) + install-page(/install-page/) 함께 서빙
 * Node 내장 모듈만 사용 (npm 불필요). 폰/같은 Wi-Fi에서 IP로 접속 가능 (0.0.0.0)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8000;
const WEB_APP_DIR = path.join(__dirname);
const INSTALL_PAGE_DIR = path.join(__dirname, 'install-page');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webmanifest': 'application/manifest+json',
};

function getMime(ext) {
  return MIME[ext] || 'application/octet-stream';
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  });
  res.writeHead(200, { 'Content-Type': getMime(ext) });
  stream.pipe(res);
}

function serveDir(res, dir, reqPath) {
  const normalized = path.resolve(dir, reqPath.replace(/^\//, '').replace(/\/$/, '') || '.');
  const dirResolved = path.resolve(dir);
  if (!normalized.startsWith(dirResolved + path.sep) && normalized !== dirResolved) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(normalized, (err, stat) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    if (stat.isDirectory()) {
      const index = path.join(normalized, 'index.html');
      fs.access(index, (e) => {
        if (e) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not Found');
          return;
        }
        sendFile(res, index);
      });
      return;
    }
    sendFile(res, normalized);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  if (pathname === '/install-page' || pathname === '/install-page/') {
    const subPath = pathname === '/install-page' ? '/install-page/' : pathname;
    serveDir(res, INSTALL_PAGE_DIR, pathname.replace(/^\/install-page/, '') || '/');
    return;
  }
  if (pathname.startsWith('/install-page/')) {
    serveDir(res, INSTALL_PAGE_DIR, pathname.slice('/install-page'.length) || '/');
    return;
  }

  serveDir(res, WEB_APP_DIR, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[8000] Web App + Install Page → http://localhost:${PORT}`);
  console.log(`[8000] Install page → http://localhost:${PORT}/install-page/`);
});
