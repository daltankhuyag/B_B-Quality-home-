const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.webp': 'image/webp',
};

const RELOAD_SNIPPET = `<script>
(function(){
  const es = new EventSource('/__reload');
  es.onmessage = () => location.reload();
})();
</script>`;

// ── Live-reload broadcast ─────────────────────────────────────────────────────

let clients = [];

function broadcast() {
  clients = clients.filter(res => {
    try { res.write('data: reload\n\n'); return true; }
    catch (_) { return false; }
  });
}

// ── File-change watcher (mtime-based, so reads don't trigger reloads) ─────────

const mtimes = new Map();

function currentMtime(filePath, cb) {
  fs.stat(filePath, (err, stat) => cb(err ? 0 : stat.mtimeMs));
}

// Seed initial mtimes so first-run doesn't falsely reload
fs.readdir(ROOT, (err, files) => {
  if (err) return;
  files.forEach(f => {
    const fp = path.join(ROOT, f);
    fs.stat(fp, (e, s) => { if (!e) mtimes.set(f, s.mtimeMs); });
  });
});

let broadcastTimer = null;

fs.watch(ROOT, { recursive: true }, (event, filename) => {
  if (!filename) return;
  if (filename === 'server.js' || filename.startsWith('.')) return;

  const filePath = path.join(ROOT, filename);

  // Only reload when the file's mtime actually changed (ignores read-access events)
  currentMtime(filePath, mtime => {
    const prev = mtimes.get(filename) || 0;
    if (mtime === prev) return;          // same timestamp → skip (no real change)
    mtimes.set(filename, mtime);

    console.log(`  changed: ${filename}`);

    // Debounce: collapse any burst of events into one reload
    clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(broadcast, 250);
  });
});

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // SSE endpoint for live reload
  if (req.url === '/__reload') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.write(': connected\n\n');   // comment line (no onmessage trigger)
    clients.push(res);
    req.on('close', () => { clients = clients.filter(c => c !== res); });
    return;
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (_) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad request');
    return;
  }

  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not found: ${urlPath}`);
      return;
    }

    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';

    if (ext === '.html') {
      const html = data.toString().replace(/<\/body>/i, RELOAD_SNIPPET + '\n</body>');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } else {
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n  Live server  →  http://localhost:${PORT}`);
  console.log(`  Watching     →  ${ROOT}`);
  console.log('\n  Press Ctrl+C to stop.\n');
});
