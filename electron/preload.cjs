const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mailerDesktop', {
  platform: process.platform,
  isDesktop: true,
  getVersion: () => process.env.npm_package_version || '0.1.0',
});
