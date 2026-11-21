const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX = 4; 
const AB = 'ABCDEFGHJKMNPRSTUVWXYZ23456789'; 
const KEY = process.env.YT_KEY; // Render'daki API Anahtarın
const GAME_PASS = process.env.GAME_PASS || 'bedrock2026'; // Oyunun Şifresi

// --- BLOK DÜNYA ONLINE (WebSocket) ---
const wss = new WebSocketServer({ noServer: true }), rooms = new Map();
let nid = 1;
const newCode = () => { let c; do c = Array.from({ length: 4 }, () => AB[Math.random() * AB.length | 0]).join(''); while (rooms.has(c)); return c; };
const send = (w, o) => w.readyState === 1 && w.send(JSON.stringify(o));
const list = r => [...r.p.values()].map(p => ({ id: p.id, n: p.n, s: p.s, h: p.id === r.host }));
const all = (r, o, except) => r.p.forEach(p => p.w !== except && send(p.w, o));
const skin = s => (s === 'steve' ? 'steve' : 'bear');

wss.on('connection', w => {
  let me = null, room = null;
  w.alive = true; w.on('pong', () => (w.alive = true));
  const leave = () => { if (!room) return; const r = room; room = null; r.p.delete(me.id); if (!r.p.size) return rooms.delete(r.c); if (r.host === me.id) r.host = r.p.keys().next().value; all(r, { t: 'left', id: me.id }); all(r, { t: 'players', l: list(r) }); };
  w.on('message', d => {
    let m; try { m = JSON.parse(d); } catch { return; }
    if (m.t === 'create' || m.t === 'join') {
      if (room) return; let r;
      if (m.t === 'create') { r = { c: newCode(), host: 0, p: new Map(), go: false }; rooms.set(r.c, r); } 
      else { r = rooms.get(String(m.c || '').toUpperCase().trim()); if (!r) return send(w, { t: 'err', m: 'Böyle bir oda yok' }); if (r.go) return send(w, { t: 'err', m: 'Oyun zaten başladı' }); if (r.p.size >= MAX) return send(w, { t: 'err', m: 'Oda dolu' }); }
      const n = String(m.n || '').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 12) || 'Oyuncu';
      me = { id: nid++, n, s: skin(m.s), w }; if (!r.host) r.host = me.id; r.p.set(me.id, me); room = r; send(w, { t: 'joined', id: me.id, c: r.c, l: list(r) }); all(r, { t: 'players', l: list(r) }, w); return;
    }
    if (!room) return;
    if (m.t === 'skin') { me.s = skin(m.s); all(room, { t: 'players', l: list(room) }); }
    else if (m.t === 'start') { if (room.host === me.id && !room.go) { room.go = true; all(room, { t: 'start', l: list(room) }); } }
    else if (m.t === 'pos') all(room, { t: 'pos', id: me.id, x: +m.x || 0, y: +m.y || 0, z: +m.z || 0, a: +m.a || 0 }, w);
    else if (m.t === 'blk' && Array.isArray(m.l)) all(room, { t: 'blk', l: m.l.slice(0, 3000) }, w);
  });
  w.on('close', leave); w.on('error', leave);
});
setInterval(() => wss.clients.forEach(w => { if (!w.alive) return w.terminate(); w.alive = false; w.ping(); }), 15000);

// --- YOUTUBE CANLI SOHBET API ---
let sseClients = new Set();
let chatInterval = null;
const api = 'https://www.googleapis.com/youtube/v3/';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchJson(url) { 
  const res = await fetch(url); 
  const data = await res.json(); 
  if (data.error) throw new Error(data.error.message); 
  return data; 
}

async function startYouTubeChat(videoId) {
  if (!KEY) {
    sseSend({ type: 'status', ok: false, text: 'API Anahtarı (YT_KEY) sunucuda tanımlı değil!' });
    return;
  }
  if (chatInterval) clearTimeout(chatInterval);
  
  sseSend({ type: 'status', ok: true, text: 'YouTube sohbetine bağlanılıyor...' });

  try {
    // Video ID'den canlı sohbeti bul
    const v = await fetchJson(`${api}videos?part=liveStreamingDetails&id=${videoId}&key=${KEY}`);
    const chatId = v.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
    if (!chatId) throw new Error('Canlı sohbet yok. Yayın açık mı veya ID doğru mu?');

    sseSend({ type: 'status', ok: true, text: 'Sohbet Bağlandı ✔' });
    let token = '', first = true;

    const poll = async () => {
      try {
        const j = await fetchJson(`${api}liveChat/messages?liveChatId=${chatId}&part=snippet,authorDetails&key=${KEY}${token ? '&pageToken=' + token : ''}`);
        token = j.nextPageToken;
        
        if (!first) {
          for (const m of j.items) {
            const t = m.snippet.displayMessage;
            if (t) sseSend({ user: m.authorDetails.displayName, text: t });
          }
        }
        first = false;
        chatInterval = setTimeout(poll, Math.max(j.pollingIntervalMillis || 5000, 5000));
      } catch (e) {
        sseSend({ type: 'status', ok: false, text: 'Sohbet koptu, tekrar deneniyor...' });
        chatInterval = setTimeout(poll, 10000);
      }
    };
    poll();
  } catch (e) {
    sseSend({ type: 'status', ok: false, text: 'Hata: ' + e.message });
  }
}

function sseSend(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(c => c.write(payload));
}

// --- WEB SUNUCUSU ---
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  // 1. Yayına Bağlanma Rotası
  if (req.method === 'POST' && u.pathname === '/connect') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.pass !== GAME_PASS && data.pass !== '') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Hatalı şifre!' }));
        }
        
        let vid = data.video.trim();
        // Link yapıştırıldıysa ID'yi ayıkla
        if (vid.includes('youtube.com') || vid.includes('youtu.be')) {
          const match = vid.match(/(?:v=|youtu\.be\/|live\/)([a-zA-Z0-9_-]{11})/);
          if (match) vid = match[1];
        }

        startYouTubeChat(vid);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, video: vid }));
      } catch (e) {
        res.writeHead(400); res.end('Bad Request');
      }
    });
    return;
  }

  // 2. SSE (Sunucudan Oyuna Veri Akışı)
  if (u.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': ok\n\n'); sseClients.add(res); req.on('close', () => sseClients.delete(res)); return;
  }

  // 3. Statik Dosyalar (HTML, JPG, MP4)
  if (req.url.startsWith('/saglik')) return res.end('ok');
  let reqUrl = req.url.split('?')[0];
  let filePath = path.join(__dirname, reqUrl === '/' ? 'index.html' : reqUrl);
  
  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4' };
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') { res.writeHead(404); res.end('404'); } else { res.writeHead(500); res.end('Hata'); }
    } else {
      res.writeHead(200, { 'Content-Type': contentType }); res.end(content, 'utf-8');
    }
  });
});

// WebSocket'leri HTTP sunucusuna bağla
srv.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, ws => { wss.emit('connection', ws, request); });
});

srv.listen(PORT, () => console.log('Sunucu Hazır → Port: ' + PORT));
