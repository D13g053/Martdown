const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: false,
    frame: true,
    titleBarStyle: 'default',
    titleBarOverlay: {
      color: '#2a2a2a',
      symbolColor: '#e0e0e0',
      height: 30
    }
  });

  win.loadFile('indice.html');
  Menu.setApplicationMenu(null);

  win.on('close', (event) => {
    event.preventDefault();
    win.webContents.send('solicitud-cierre');
  });

  win.on('closed', () => {
    win = null;
  });
}

ipcMain.on('forzar-cierre', () => {
  const ventana = BrowserWindow.getFocusedWindow();
  if (ventana) {
    ventana.destroy();
  }
});

ipcMain.on('exportar-pdf-desde-renderer', async (event, htmlContent) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    
    const { filePath } = await dialog.showSaveDialog(parentWindow, {
        title: 'Guardar PDF',
        buttonLabel: 'Guardar',
        defaultPath: `documento-${Date.now()}.pdf`,
        filters: [
            { name: 'Documentos PDF', extensions: ['pdf'] }
        ]
    });

    if (!filePath) {
        return;
    }

    const tempHTMLPath = path.join(os.tmpdir(), `temp-pdf-${Date.now()}.html`);
    const pdfWindow = new BrowserWindow({ show: false });

    try {
        fs.writeFileSync(tempHTMLPath, htmlContent);
        await pdfWindow.loadFile(tempHTMLPath);
        const pdfOptions = {
            marginsType: 0,
            pageSize: 'A4',
            printBackground: true,
        };

        const pdfData = await pdfWindow.webContents.printToPDF(pdfOptions);
        fs.writeFileSync(filePath, pdfData);

    } catch (error) {
        console.error('Error al generar o guardar el PDF:', error);
        dialog.showErrorBox('Error', 'No se pudo generar el PDF. Revise la consola para más detalles.');
    } finally {
        if (fs.existsSync(tempHTMLPath)) {
            fs.unlinkSync(tempHTMLPath);
        }
        if (pdfWindow) {
            pdfWindow.close();
        }
    }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});