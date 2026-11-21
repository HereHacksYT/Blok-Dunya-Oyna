const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX = 4; 
const AB = 'ABCDEFGHJKMNPRSTUVWXYZ23456789'; 
const KEY = process.env.YT_KEY; // SADECE SENİN API ANAHTARIN (Render'da saklı)

// --- YOUTUBE API KISMI ---
const api = 'https://www.googleapis.com/youtube/v3/';
async function get(url) { const j = await (await fetch(url)).json(); if (j.error) throw new Error(j.error.message); return j; }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Aktif yayınları takip eden havuz (aynı yayına iki kez bağlanmayı önler)
const activeStreams = new Map();

async function trackStream(videoId, res) {
  // Eğer bu yayın için zaten bir dinleyici varsa, direkt listeye ekle ve çık
  if (activeStreams.has(videoId)) {
    activeStreams.get(videoId).clients.add(res);
    return;
  }

  const streamData = { clients: new Set([res]), token: '', interval: null, first: true };
  activeStreams.set(videoId, streamData);

  try {
    const v = await get(`${api}videos?part=liveStreamingDetails&id=${videoId}&key=${KEY}`);
    const chatId = v.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
    if (!chatId) throw new Error('Canlı sohbet bulunamadı (Yayın kapalı veya ID yanlış)');

    console.log(`[BAĞLANDI] Yayın ID: ${videoId}`);

    const loop = async () => {
      try {
        const j = await get(`${api}liveChat/messages?liveChatId=${chatId}&part=snippet,authorDetails&key=${KEY}${streamData.token ? '&pageToken=' + streamData.token : ''}`);
        streamData.token = j.nextPageToken;
        
        if (!streamData.first) {
          for (const m of j.items) {
            const t = m.snippet.displayMessage;
            if (t) {
              const payload = `data: ${JSON.stringify({ user: m.authorDetails.displayName, text: t })}\n\n`;
              streamData.clients.forEach(c => c.write(payload));
            }
          }
        }
        streamData.first = false;
        
        // Sohbeti kontrol etmeye devam et
        streamData.interval = setTimeout(loop, Math.max(j.pollingIntervalMillis || 5000, 5000));
      } catch (e) {
        console.log(`[HATA] ${videoId}:`, e.message);
        streamData.interval = setTimeout(loop, 15000); // Hata olursa 15 sn bekle
      }
    };
    loop();

  } catch (e) {
    console.log(`[HATA] ${videoId}:`, e.message);
    const payload = `data: ${JSON.stringify({ err: e.message })}\n\n`;
    res.write(payload);
    activeStreams.delete(videoId);
  }

  // Bağlantı kapandığında temizlik yap
  res.on('close', () => {
    const s = activeStreams.get(videoId);
    if (s) {
      s.clients.delete(res);
      if (s.clients.size === 0) {
        clearTimeout(s.interval);
        activeStreams.delete(videoId);
        console.log(`[AYRILDI] Yayın ID: ${videoId}`);
      }
    }
  });
}

// --- WEB SUNUCUSU ---
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  // SSE (Canlı Sohbet Bağlantısı)
  if (u.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': ok\n\n');
    const videoId = u.searchParams.get('v');
    if (videoId && KEY) {
      trackStream(videoId, res);
    } else {
      res.write(`data: ${JSON.stringify({ err: 'API Anahtarı yok veya Video ID girilmedi' })}\n\n`);
    }
    return;
  }
  
  // Test rotası
  if (u.pathname === '/test') {
    // Bu rota sadece test içindir, Bedrock Kutu HTML'de kullanılmıyor
    return res.end('Test için HTML içinden bağlanın');
  }

  // Statik dosyalar
  if (req.url.startsWith('/saglik')) return res.end('ok');
  let reqUrl = req.url.split('?')[0];
  let filePath = path.join(__dirname, reqUrl === '/' ? 'index.html' : reqUrl);
  
  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4' };
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') { res.writeHead(404); res.end('404'); } 
      else { res.writeHead(500); res.end('Sunucu Hatası'); }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// --- BLOK DÜNYA ONLINE (WebSocket) ---
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
    const r = room; room = null; r.p.delete(me.id);
    if (!r.p.size) return rooms.delete(r.c);
    if (r.host === me.id) r.host = r.p.keys().next().value;
    all(r, { t: 'left', id: me.id }); all(r, { t: 'players', l: list(r) });
  };
  w.on('message', d => {
    let m; try { m = JSON.parse(d); } catch { return; }
    if (m.t === 'create' || m.t === 'join') {
      if (room) return; let r;
      if (m.t === 'create') { r = { c: newCode(), host: 0, p: new Map(), go: false }; rooms.set(r.c, r); }
      else {
        r = rooms.get(String(m.c || '').toUpperCase().trim());
        if (!r) return send(w, { t: 'err', m: 'Böyle bir oda yok' });
        if (r.go) return send(w, { t: 'err', m: 'Oyun zaten başladı' });
        if (r.p.size >= MAX) return send(w, { t: 'err', m: 'Oda dolu' });
      }
      const n = String(m.n || '').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 12) || 'Oyuncu';
      me = { id: nid++, n, s: skin(m.s), w }; if (!r.host) r.host = me.id;
      r.p.set(me.id, me); room = r; send(w, { t: 'joined', id: me.id, c: r.c, l: list(r) }); all(r, { t: 'players', l: list(r) }, w); return;
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
srv.listen(PORT, () => console.log('Sunucu Hazır → Port: ' + PORT));
