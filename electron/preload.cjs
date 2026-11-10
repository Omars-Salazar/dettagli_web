const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', { invoke: (canal, datos) => ipcRenderer.invoke(canal, datos) });
