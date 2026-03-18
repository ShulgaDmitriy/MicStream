const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize:      ()       => ipcRenderer.send('window-minimize'),
  close:         ()       => ipcRenderer.send('window-close'),
  openExternal:  (url)    => ipcRenderer.send('open-external', url),
  setTrayActive: (active) => ipcRenderer.send('set-tray-active', active),
  updateTrayIP:  (ip)     => ipcRenderer.send('update-tray-ip', ip),
});
