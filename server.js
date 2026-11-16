// Blokdünya Online sunucusu — node server.js  →  http://localhost:3000
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000, MAX = 4;
const HTML = path.join(__dirname, 'blokdunya_online.html');
const AB = 'ABCDEFGHJKMNPRSTUVWXYZ23456789';           // karışan harfler (O,0,I,1,L) yok

const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/saglik')) return r.end('ok');
  fs.stat(HTML, (e, s) => {
    if (e) { r.writeHead(500); return r.end('blokdunya_online.html bu klasörde olmalı'); }
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': s.size });
    fs.createReadStream(HTML).pipe(r);
  });
});

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
    if (r.host === me.id) r.host = r.p.keys().next().value;     // kurucu çıkarsa sıradaki kurucu olur
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
srv.listen(PORT, () => console.log('Blokdünya Online hazır → http://localhost:' + PORT));
