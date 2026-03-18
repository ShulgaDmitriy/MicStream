const https = require('https');
const http = require('http');
const WebSocket = require('ws');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const os = require('os');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      const ip = iface.address;
      const isLAN = ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
      candidates.push({ ip, isLAN, name });
    }
  }
  const lan = candidates.find(c => c.isLAN);
  if (lan) return lan.ip;
  if (candidates.length > 0) return candidates[0].ip;
  return 'localhost';
}

const PORT = 3000;
const DISCOVERY_PORT = 55505; // UDP broadcast port
const LOCAL_IP = getLocalIP();
const CERT_FILE = path.join(__dirname, 'cert.pem');
const KEY_FILE  = path.join(__dirname, 'key.pem');

function ensureCert() {
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) return;
  console.log('  Генерация SSL сертификата...');
  try {
    const selfsigned = require('selfsigned');
    const pems = selfsigned.generate([{ name: 'commonName', value: LOCAL_IP }], {
      keySize: 2048, days: 365, algorithm: 'sha256',
      extensions: [{ name: 'subjectAltName', altNames: [
        { type: 7, ip: LOCAL_IP },
        { type: 7, ip: '127.0.0.1' },
        { type: 2, value: 'localhost' }
      ]}]
    });
    fs.writeFileSync(KEY_FILE, pems.private);
    fs.writeFileSync(CERT_FILE, pems.cert);
    console.log('  Сертификат создан!\n');
  } catch(e) {
    console.error('  Ошибка генерации сертификата:', e.message);
    process.exit(1);
  }
}

ensureCert();

function handleRequest(req, res) {
  let filePath = '';
  if (req.url === '/' || req.url === '/pc') filePath = path.join(__dirname, '../pc-client/index.html');
  else if (req.url === '/phone')            filePath = path.join(__dirname, '../phone-client/index.html');
  else { res.writeHead(404); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(500); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
}

const sslOptions = { key: fs.readFileSync(KEY_FILE), cert: fs.readFileSync(CERT_FILE) };
const server = https.createServer(sslOptions, handleRequest);
// HTTP порт 3001 — discovery endpoint (Android WebView может делать HTTP запросы)
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/discover') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ type: 'micstream-server', ip: LOCAL_IP, port: PORT }));
  } else {
    res.writeHead(301, { Location: 'https://' + LOCAL_IP + ':' + PORT + req.url });
    res.end();
  }
}).listen(3001, '0.0.0.0');

// ── UDP Discovery ─────────────────────────────────────────────────────────
// Телефон шлёт broadcast, сервер отвечает своим IP и портом
const udpServer = dgram.createSocket('udp4');

udpServer.on('message', (msg, rinfo) => {
  try {
    const data = JSON.parse(msg.toString());
    if (data.type === 'micstream-discover') {
      const reply = JSON.stringify({
        type: 'micstream-server',
        ip: LOCAL_IP,
        port: PORT,
        name: os.hostname()
      });
      udpServer.send(reply, rinfo.port, rinfo.address, () => {});
      console.log(`[Discovery] Ответил телефону ${rinfo.address}`);
    }
  } catch(e) {}
});

udpServer.bind(DISCOVERY_PORT, '0.0.0.0', () => {
  console.log(`  UDP Discovery слушает на порту ${DISCOVERY_PORT}`);
});

// ── WebSocket ─────────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });
let pcClient = null, phoneClient = null;
let stats = { packetsReceived: 0, startTime: null, bytesReceived: 0 };

wss.on('connection', (ws, req) => {
  const url = req.url.split('?')[0];
  const type = url === '/ws/pc' ? 'pc' : url === '/ws/phone' ? 'phone' : null;
  if (!type) { ws.close(); return; }

  console.log(`[${new Date().toLocaleTimeString()}] ${type.toUpperCase()} connected`);

  if (type === 'pc') {
    pcClient = ws;
    if (phoneClient?.readyState === WebSocket.OPEN)
      phoneClient.send(JSON.stringify({ type: 'pc-ready' }));
    ws.send(JSON.stringify({ type: 'server-info', ip: LOCAL_IP, port: PORT }));
  } else {
    phoneClient = ws;
    stats.packetsReceived = 0; stats.bytesReceived = 0;
    ws.send(JSON.stringify({ type: 'status', pcConnected: pcClient?.readyState === WebSocket.OPEN }));
    if (pcClient?.readyState === WebSocket.OPEN)
      pcClient.send(JSON.stringify({ type: 'phone-connected' }));
  }

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (type === 'phone' && pcClient?.readyState === WebSocket.OPEN) pcClient.send(JSON.stringify(msg));
      else if (type === 'pc' && phoneClient?.readyState === WebSocket.OPEN) phoneClient.send(JSON.stringify(msg));
    } catch {
      if (type === 'phone' && pcClient?.readyState === WebSocket.OPEN) {
        stats.packetsReceived++; stats.bytesReceived += data.length;
        if (!stats.startTime) stats.startTime = Date.now();
        pcClient.send(data);
        if (stats.packetsReceived % 50 === 0) {
          pcClient.send(JSON.stringify({ type: 'stats', packets: stats.packetsReceived, bytes: stats.bytesReceived, duration: Math.floor((Date.now() - stats.startTime) / 1000) }));
        }
      }
    }
  });

  ws.on('close', () => {
    console.log(`[${new Date().toLocaleTimeString()}] ${type.toUpperCase()} disconnected`);
    if (type === 'pc') {
      pcClient = null;
      phoneClient?.readyState === WebSocket.OPEN && phoneClient.send(JSON.stringify({ type: 'pc-disconnected' }));
    } else {
      phoneClient = null; stats.startTime = null;
      pcClient?.readyState === WebSocket.OPEN && pcClient.send(JSON.stringify({ type: 'phone-disconnected' }));
    }
  });

  ws.on('error', (err) => console.error(`WS error (${type}):`, err.message));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║       MicStream Server Ready  (HTTPS)            ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  PC:      https://${LOCAL_IP}:${PORT}/pc`);
  console.log(`║  Телефон: https://${LOCAL_IP}:${PORT}/phone`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  ! На телефоне принять сертификат:               ║');
  console.log('║    "Дополнительно" -> "Всё равно перейти"        ║');
  console.log('╠══════════════════════════════════════════════════╣');
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) {
        const tag = a.address === LOCAL_IP ? ' <- используется' : '';
        console.log(`║    ${name}: ${a.address}${tag}`);
      }
    }
  }
  console.log('╚══════════════════════════════════════════════════╝\n');
});