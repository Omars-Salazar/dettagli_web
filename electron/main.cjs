const { app, BrowserWindow } = require('electron');
const path = require('path');
// En desarrollo lee .env de la raíz; instalado, lee el .env junto al .exe
require('dotenv').config({ path: app.isPackaged ? path.join(path.dirname(process.execPath), '.env') : path.join(__dirname, '..', '.env') });
const { register } = require('./backend.cjs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1000, minHeight: 640,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  if (app.isPackaged) win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  else win.loadURL('http://localhost:5173');
}

app.whenReady().then(() => { register(); createWindow(); });
app.on('window-all-closed', () => app.quit());
