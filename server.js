// Hem Blok Dünya Online (WebSocket) hem de Bedrock Kutu (SSE + YouTube) sunucusu
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX = 4; // Blok Dünya Online max oyuncu
const AB = 'ABCDEFGHJKMNPRSTUVWXYZ23456789'; 

// --- YOUTUBE CANLI SOHBET AYARLARI ---
const KEY = process.env.YT_KEY, VIDEO = process.env.YT_VIDEO;
const sseClients = new Set();
const sseSend = (o) => { const d = `data: ${JSON.stringify(o)}\n\n`; sseClients.forEach((r) => r.write(d)); };

// --- WEB SUNUCUSU (HTML, JPG, MP4, SSE) ---
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  // 1. YouTube Canlı Sohbet Bağlantısı (SSE)
  if (u.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': ok\n\n'); sseClients.add(res); req.on('close', () => sseClients.delete(res)); return;
  }
  
  // 2. Test Rotası (Bedrock Kutu için)
  if (u.pathname === '/test') {
    sseSend({ user: u.searchParams.get('user') || 'Test', text: u.searchParams.get('text') || 'tnt' });
    return res.end('gönderildi');
  }

  // 3. Statik Dosya Sunucusu (HTML, MP4 vs.)
  if (req.url.startsWith('/saglik')) return res.end('ok');
  let reqUrl = req.url.split('?')[0];
  let filePath = path.join(__dirname, reqUrl === '/' ? 'index.html' : reqUrl);
  
  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4'
  };
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 - Dosya Bulunamadı</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end('Sunucu Hatası: ' + error.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// --- BLOK DÜNYA ONLINE (WEBSOCKET KISMI) ---
const wss = new WebSocketServer({ server: srv }), rooms = new Map();
let nid = 1;
const newCode = () => { let c; do c = Array.from({ length: 4 }, () => AB[Math.random() * AB.length | 0]).join(''); while (rooms.has(c)); return c; };
const send = (w, o) => w.readyState === 1 && w.send(JSON.stringify(o));
const list = r => [...r.p.values()].map(p => ({ id: p.id, n: p.n, s: p.s, h: p.id === r.host }));
const all = (r, o, except) => r.p.forEach(p => p.w !== except && send(p.w, o));
const skin = s => (s === 'steve' ? 'steve' : 'bear');

wss.on('connection', w => {
  let me = null, room = null;
  w.alive = true; w.on('pong', () => (w.alive = true));

  const leave = () => {
    if (!room) return;
    const r = room; room = null;
    r.p.delete(me.id);
    if (!r.p.size) return rooms.delete(r.c);
    if (r.host === me.id) r.host = r.p.keys().next().value;
    all(r, { t: 'left', id: me.id });
    all(r, { t: 'players', l: list(r) });
  };

  w.on('message', d => {
    let m; try { m = JSON.parse(d); } catch { return; }
    if (m.t === 'create' || m.t === 'join') {
      if (room) return;
      let r;
      if (m.t === 'create') { r = { c: newCode(), host: 0, p: new Map(), go: false }; rooms.set(r.c, r); }
      else {
        r = rooms.get(String(m.c || '').toUpperCase().trim());
        if (!r) return send(w, { t: 'err', m: 'Böyle bir oda yok' });
        if (r.go) return send(w, { t: 'err', m: 'Oyun zaten başladı' });
        if (r.p.size >= MAX) return send(w, { t: 'err', m: 'Oda dolu (en fazla 4 kişi)' });
      }
      const n = String(m.n || '').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 12) || 'Oyuncu';
      me = { id: nid++, n, s: skin(m.s), w };
      if (!r.host) r.host = me.id;
      r.p.set(me.id, me); room = r;
      send(w, { t: 'joined', id: me.id, c: r.c, l: list(r) });
      all(r, { t: 'players', l: list(r) }, w);
      return;
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

// --- YOUTUBE API DÖNGÜSÜ (BEDROCK KUTU) ---
const api = 'https://www.googleapis.com/youtube/v3/';
async function get(url) { const j = await (await fetch(url)).json(); if (j.error) throw new Error(j.error.message); return j; }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function chat() {
  if (!KEY || !VIDEO) return console.log('YT_KEY / YT_VIDEO verilmedi → sadece test modu (/test?text=tnt)');
  try {
    const v = await get(`${api}videos?part=liveStreamingDetails&id=${VIDEO}&key=${KEY}`);
    const id = v.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
    if (!id) throw new Error('Canlı sohbet bulunamadı (yayın canlı mı? video ID doğru mu?)');
    console.log('YouTube sohbetine bağlandı ✔');
    let token = '', first = true;
    for (;;) {
      const j = await get(`${api}liveChat/messages?liveChatId=${id}&part=snippet,authorDetails&key=${KEY}${token ? '&pageToken=' + token : ''}`);
      token = j.nextPageToken;
      if (!first) for (const m of j.items) { const t = m.snippet.displayMessage; if (t) sseSend({ user: m.authorDetails.displayName, text: t }); }
      first = false; 
      await wait(Math.max(j.pollingIntervalMillis || 5000, 5000));
    }
  } catch (e) { console.log('HATA:', e.message, '→ 15 sn sonra tekrar denenecek'); setTimeout(chat, 15000); }
}
chat();

srv.listen(PORT, () => console.log('Blok Dünya & Bedrock Kutu sunucusu hazır → Port: ' + PORT));
