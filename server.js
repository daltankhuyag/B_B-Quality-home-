const http = require('http');
const fs   = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const PORT = 3000;
const ROOT = __dirname;

// ── Email configuration ───────────────────────────────────────────────────────
// Fill in your SMTP credentials below before deploying.
// Common hosts:
//   Google Workspace : host:'smtp.gmail.com', port:587
//   Microsoft 365   : host:'smtp.office365.com', port:587
//   cPanel/hosting  : host:'mail.bbqualityhome.com', port:587
const EMAIL_CONFIG = {
  host:   'smtp.gmail.com',   // ← change to your SMTP host
  port:   587,
  secure: false,              // true for port 465, false for 587
  auth: {
    user: 'info@bbqualityhome.com',   // ← your email address
    pass: 'YOUR_APP_PASSWORD_HERE',   // ← your email password / app password
  },
};

const TO_ADDRESS   = 'info@bbqualityhome.com';
const FROM_ADDRESS = '"B&B Quality Home" <info@bbqualityhome.com>';

const transporter = nodemailer.createTransport(EMAIL_CONFIG);

// ── MIME types ────────────────────────────────────────────────────────────────
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

// ── File-change watcher ───────────────────────────────────────────────────────
const mtimes = new Map();

function currentMtime(filePath, cb) {
  fs.stat(filePath, (err, stat) => cb(err ? 0 : stat.mtimeMs));
}

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
  currentMtime(filePath, mtime => {
    const prev = mtimes.get(filename) || 0;
    if (mtime === prev) return;
    mtimes.set(filename, mtime);
    console.log(`  changed: ${filename}`);
    clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(broadcast, 250);
  });
});

// ── Helper: read full request body ───────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {

  // SSE live-reload endpoint
  if (req.url === '/__reload') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.write(': connected\n\n');
    clients.push(res);
    req.on('close', () => { clients = clients.filter(c => c !== res); });
    return;
  }

  // Quote form submission endpoint
  if (req.method === 'POST' && req.url === '/send-quote') {
    res.setHeader('Content-Type', 'application/json');
    try {
      const raw  = await readBody(req);
      const body = JSON.parse(raw);

      const { name, phone, email, service, details } = body;

      if (!name || !email) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'Missing required fields.' }));
        return;
      }

      const mailOptions = {
        from:    FROM_ADDRESS,
        to:      TO_ADDRESS,
        replyTo: email,
        subject: `New Quote Request — ${service || 'General'} from ${name}`,
        text: [
          `Name:    ${name}`,
          `Phone:   ${phone || '—'}`,
          `Email:   ${email}`,
          `Service: ${service || '—'}`,
          ``,
          `Details:`,
          details || '(none provided)',
        ].join('\n'),
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#ff6a00;margin-bottom:4px;">New Quote Request</h2>
            <p style="color:#888;font-size:13px;margin-top:0;">via B&amp;B Quality Home Improvement website</p>
            <table style="width:100%;border-collapse:collapse;margin-top:20px;">
              <tr><td style="padding:10px 0;border-top:1px solid #eee;color:#888;width:100px;font-size:13px;">Name</td><td style="padding:10px 0;border-top:1px solid #eee;font-weight:600;">${name}</td></tr>
              <tr><td style="padding:10px 0;border-top:1px solid #eee;color:#888;font-size:13px;">Phone</td><td style="padding:10px 0;border-top:1px solid #eee;">${phone || '—'}</td></tr>
              <tr><td style="padding:10px 0;border-top:1px solid #eee;color:#888;font-size:13px;">Email</td><td style="padding:10px 0;border-top:1px solid #eee;"><a href="mailto:${email}">${email}</a></td></tr>
              <tr><td style="padding:10px 0;border-top:1px solid #eee;color:#888;font-size:13px;">Service</td><td style="padding:10px 0;border-top:1px solid #eee;">${service || '—'}</td></tr>
            </table>
            <div style="margin-top:20px;padding:16px;background:#f6f3ee;border-left:3px solid #ff6a00;">
              <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Project Details</p>
              <p style="margin:8px 0 0;white-space:pre-wrap;">${details || '(none provided)'}</p>
            </div>
            <p style="margin-top:24px;font-size:12px;color:#aaa;">Reply directly to this email to reach the customer.</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`  quote sent: ${name} <${email}>`);
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error('  email error:', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: 'Failed to send email.' }));
    }
    return;
  }

  // Static file serving
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
