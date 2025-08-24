const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onSolicitudCierre: (callback) => ipcRenderer.on('solicitud-cierre', (_event, ...args) => callback(...args)),
    forzarCierre: () => ipcRenderer.send('forzar-cierre'),
    exportarPDF: (htmlContent) => ipcRenderer.send('exportar-pdf-desde-renderer', htmlContent),
});