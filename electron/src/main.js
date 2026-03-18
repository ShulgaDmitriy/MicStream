const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (url.includes('localhost') || url.includes('192.168.') || url.includes('10.')) {
    event.preventDefault(); callback(true);
  } else { callback(false); }
});

const isDev = !app.isPackaged;
const resourcesPath = isDev ? path.join(__dirname, '../..') : process.resourcesPath;
const serverPath    = isDev ? path.join(__dirname, '../../server') : path.join(resourcesPath, 'server');
const uiPath        = isDev ? path.join(__dirname, '../ui') : path.join(resourcesPath, 'ui');

let mainWindow = null, tray = null;

// ── Server ────────────────────────────────────────────────────────────────
let serverProc = null;

function startServer() {
  const serverFile = path.join(serverPath, 'server.js');
  if (!fs.existsSync(serverFile)) {
    console.error('server.js not found:', serverFile);
    return;
  }

  if (isDev) {
    try { require(serverFile); } catch(e) { console.error('Server error:', e.message); }
    return;
  }

  // Packaged: spawn with NODE_PATH pointing to server/node_modules
  const nodeMods = path.join(serverPath, 'node_modules');
  serverProc = require('child_process').spawn(process.execPath, [serverFile], {
    cwd: serverPath,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_PATH: nodeMods },
    stdio: 'ignore'
  });
  serverProc.on('error', (e) => console.error('Server proc error:', e.message));
  serverProc.on('exit', (code) => {
    if (!app.isQuitting) setTimeout(startServer, 2000);
  });
}

// ── Tray ──────────────────────────────────────────────────────────────────
function getTrayIcon(active = false) {
  const iconPath = path.join(__dirname, active ? 'icon-active.png' : 'icon.png');
  if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  const color = active ? '#00ff88' : '#888888';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <rect x="5" y="1" width="6" height="8" rx="3" fill="${color}"/>
    <path d="M2 7 Q2 13 8 13 Q14 13 14 7" stroke="${color}" stroke-width="1.5" fill="none"/>
    <line x1="8" y1="13" x2="8" y2="15" stroke="${color}" stroke-width="1.5"/>
    <line x1="5" y1="15" x2="11" y2="15" stroke="${color}" stroke-width="1.5"/>
  </svg>`;
  return nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
}

function createTray() {
  tray = new Tray(getTrayIcon(false));
  tray.setToolTip('MicStream');
  updateTrayMenu();
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

function updateTrayMenu(ip = null) {
  const menu = Menu.buildFromTemplate([
    { label: 'Открыть MicStream', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    ip ? { label: `IP: ${ip}`, enabled: false } : { label: 'Сервер запускается...', enabled: false },
    ip ? { label: 'Скопировать IP телефона', click: () => clipboard.writeText(`https://${ip}:3000/phone`) } : { type: 'separator' },
    { type: 'separator' },
    { label: 'Выход', click: () => { app.isQuitting = true; if(serverProc) serverProc.kill(); app.quit(); } }
  ]);
  tray.setContextMenu(menu);
}

// ── Window ────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460, height: 460,
    minWidth: 380, maxWidth: 900,
    minHeight: 460, maxHeight: 460,
    frame: false,
    backgroundColor: '#00000000',
    resizable: true,
    transparent: true,
    hasShadow: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
    icon: path.join(__dirname, 'icon.png'),
  });

  mainWindow.loadFile(path.join(uiPath, 'app.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); } });
  mainWindow.on('minimize', (e) => { e.preventDefault(); mainWindow.hide(); });
}

// ── IPC ───────────────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow.hide());
ipcMain.on('window-close', () => mainWindow.hide());
ipcMain.on('open-external', (_, url) => shell.openExternal(url));
ipcMain.on('set-tray-active', (_, active) => {
  tray.setImage(getTrayIcon(active));
  tray.setToolTip(active ? 'MicStream — трансляция 🎙️' : 'MicStream');
});
ipcMain.on('update-tray-ip', (_, ip) => updateTrayMenu(ip));

// ── Boot ──────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startServer();
  createTray();
  createWindow();
  app.on('second-instance', () => { mainWindow.show(); mainWindow.focus(); });
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('activate', () => mainWindow.show());