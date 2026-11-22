const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX = 4; 
const AB = 'ABCDEFGHJKMNPRSTUVWXYZ23456789'; 

// --- YOUTUBE AYARLARI (Render'dan Çekilir) ---
const KEY = process.env.YT_KEY;       // API Anahtarın
const VIDEO = process.env.YT_VIDEO;   // Canlı Yayın ID'n
const GAME_PASS = process.env.GAME_PASS || 'bedrock2026'; // Oyunun Şifresi

// --- SSE İSTEMCİLERİ ---
const sseClients = new Set();
function sseSend(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(c => c.write(payload));
}

// --- YOUTUBE API DÖNGÜSÜ ---
const api = 'https://www.googleapis.com/youtube/v3/';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function getJson(url) { 
  const res = await fetch(url); 
  const data = await res.json(); 
  if (data.error) throw new Error(data.error.message); 
  return data; 
}

async function chatLoop() {
  if (!KEY || !VIDEO) {
    console.log('YT_KEY / YT_VIDEO eksik. YouTube bağlantısı yapılmadı.');
    return;
  }
  
  console.log('YouTube sohbetine bağlanılıyor...');
  try {
    const v = await getJson(`${api}videos?part=liveStreamingDetails&id=${VIDEO}&key=${KEY}`);
    const chatId = v.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
    if (!chatId) throw new Error('Canlı sohbet yok. Yayın açık mı?');

    console.log('Sohbet bağlandı ✔');
    sseSend({ type: 'status', ok: true, text: 'Sohbet bağlı ✔' });

    let token = '', first = true;
    for (;;) {
      try {
        const j = await getJson(`${api}liveChat/messages?liveChatId=${chatId}&part=snippet,authorDetails&key=${KEY}${token ? '&pageToken=' + token : ''}`);
        token = j.nextPageToken;
        
        if (!first) {
          for (const m of j.items) {
            const t = m.snippet.displayMessage;
            if (t) sseSend({ user: m.authorDetails.displayName, text: t });
          }
        }
        first = false;
        await wait(Math.max(j.pollingIntervalMillis || 5000, 5000));
      } catch (e) {
        console.log('YT API Hatası:', e.message);
        sseSend({ type: 'status', ok: false, text: 'Sohbet koptu, tekrar deneniyor...' });
        await wait(10000);
      }
    }
  } catch (e) {
    console.log('YT Başlatma Hatası:', e.message);
    sseSend({ type: 'status', ok: false, text: e.message });
    setTimeout(chatLoop, 15000); // 15 sn sonra tekrar dene
  }
}

// Sunucu başlarken YouTube döngüsünü başlat
setTimeout(chatLoop, 2000);

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

// --- WEB SUNUCUSU (Statik Dosyalar ve Şifre Koruması) ---
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  // 1. Bedrock Kutu Şifre Koruması (Sadece senin girebilmen için)
  if (u.pathname === '/bedrock-kutu.html') {
    const cookies = req.headers.cookie || '';
    if (!cookies.includes('auth=ok')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`
        <body style="background:#0b1220;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;">
            <h2>🔒 Bu oyun özeldir.</h2>
            <p>Lütfen yayıncı şifresini girin:</p>
            <input type="password" id="p" style="padding:10px;border-radius:5px;border:none;">
            <button onclick="fetch('/auth', {method:'POST', body:document.getElementById('p').value}).then(r=>{if(r.ok)location.reload();else alert('Hatalı Şifre!')})" style="padding:10px;border-radius:5px;border:none;cursor:pointer;">Giriş</button>
          </div>
        </body>
      `);
    }
  }

  // 2. Şifre Kontrol Rotası
  if (req.method === 'POST' && u.pathname === '/auth') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      if (body === GAME_PASS) {
        res.writeHead(200, { 'Set-Cookie': 'auth=ok; HttpOnly; Path=/' });
        res.end('OK');
      } else {
        res.writeHead(401); res.end('Hatalı');
      }
    });
    return;
  }

  // 3. SSE (Sunucudan Oyuna Veri Akışı)
  if (u.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': ok\n\n'); sseClients.add(res); req.on('close', () => sseClients.delete(res)); return;
  }

  // 4. Statik Dosyalar (HTML, JPG, MP4)
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
