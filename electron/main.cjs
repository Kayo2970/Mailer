/**
 * electron/main.cjs — Electron desktop wrapper for Mailer.
 *
 * Runs on Windows, macOS, and Linux:
 * 1. Manages a single application instance (focuses existing window if launched again).
 * 2. Allocates a dedicated local port on 127.0.0.1.
 * 3. Sets MAILER_DATA_DIR to OS-standard app data path (so settings/history persist across updates).
 * 4. Starts the bundled Next.js standalone server and opens a native dark/gold desktop window.
 * 5. Routes external links to the user's default web browser.
 */
const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');
const { fork } = require('child_process');

let mainWindow = null;
let splashWindow = null;
let serverProcess = null;
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Configure persistent data directory
const defaultDataDir = path.join(app.getPath('userData'), 'data');
if (!process.env.MAILER_DATA_DIR) {
  process.env.MAILER_DATA_DIR = defaultDataDir;
}

/** Show the loading window immediately so the user sees the app is starting. */
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 440,
    height: 320,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    center: true,
    show: false,
    backgroundColor: '#090d16',
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.once('ready-to-show', () => splashWindow && splashWindow.show());
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
  return splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

/** Update the splash progress bar (0-100) and status text. */
function setProgress(pct, msg, isError = false) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents
    .executeJavaScript(`window.setProgress(${Number(pct)}, ${JSON.stringify(msg)}, ${isError})`)
    .catch(() => {});
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
}

/** Find an available port on 127.0.0.1 */
function getAvailablePort(preferred = 3040) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(preferred, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      // Preferred port in use, pick any free port
      const fallback = net.createServer();
      fallback.listen(0, '127.0.0.1', () => {
        const { port } = fallback.address();
        fallback.close(() => resolve(port));
      });
    });
  });
}

/** Poll URL until it returns HTTP 200/304 */
function waitForServer(url, timeoutMs = 25000, onTick) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function ping() {
      if (onTick) onTick(Date.now() - start);
      const req = http.get(url, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve(true);
        } else if (Date.now() - start > timeoutMs) {
          reject(new Error('Server start timed out'));
        } else {
          setTimeout(ping, 250);
        }
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Server start timed out'));
        } else {
          setTimeout(ping, 250);
        }
      });
      req.end();
    }
    ping();
  });
}

/** Start the Next.js standalone server process */
async function startServer(port) {
  if (isDev) {
    // In development mode, check if next dev is already running on 3040
    try {
      await waitForServer('http://127.0.0.1:3040/', 1200);
      return 'http://127.0.0.1:3040';
    } catch {
      console.log('[Electron] Dev server not detected on 3040, starting standalone server...');
    }
  }

  // Determine path to standalone server.js
  let serverScript = path.join(__dirname, '..', '.next', 'standalone', 'server.js');
  if (app.isPackaged) {
    const packagedServer = path.join(process.resourcesPath, '.next', 'standalone', 'server.js');
    const asarUnpackedServer = path.join(process.resourcesPath, 'app.asar.unpacked', '.next', 'standalone', 'server.js');
    if (require('fs').existsSync(packagedServer)) {
      serverScript = packagedServer;
    } else if (require('fs').existsSync(asarUnpackedServer)) {
      serverScript = asarUnpackedServer;
    }
  }

  const serverDir = path.dirname(serverScript);
  console.log(`[Electron] Starting server from: ${serverScript} on port ${port}`);

  serverProcess = fork(serverScript, [], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      MAILER_DATA_DIR: process.env.MAILER_DATA_DIR,
    },
    stdio: 'inherit',
  });

  serverProcess.on('error', (err) => {
    console.error('[Electron] Server process error:', err);
  });

  const url = `http://127.0.0.1:${port}`;
  setProgress(30, 'Starting the Mailer engine…');
  // Creep from 30% toward 85% while the server boots (never reaches 100% on its own).
  await waitForServer(url, 25000, (elapsed) => {
    setProgress(30 + 55 * (1 - Math.exp(-elapsed / 3500)), 'Starting the Mailer engine…');
  });
  setProgress(88, 'Engine ready');
  return url;
}

function createWindow(url) {
  const iconPath = path.join(__dirname, '..', 'public', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'Mailer',
    backgroundColor: '#090d16',
    icon: iconPath,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true,
    },
  });

  // Open external links in user's default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('http://127.0.0.1') && !url.startsWith('http://localhost')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!targetUrl.startsWith('http://127.0.0.1') && !targetUrl.startsWith('http://localhost')) {
      event.preventDefault();
      shell.openExternal(targetUrl);
    }
  });

  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    setProgress(100, 'Ready');
    mainWindow.show();
    closeSplash();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    await createSplash();
    setProgress(5, 'Preparing…');
    const port = await getAvailablePort(3040);
    setProgress(15, 'Preparing your data folder…');
    const url = await startServer(port);
    setProgress(92, 'Loading the interface…');
    createWindow(url);
  } catch (err) {
    closeSplash();
    console.error('[Electron] Failed to start Mailer:', err);
    dialog.showErrorBox(
      'Mailer failed to start',
      `${err && err.message ? err.message : err}\n\nThe bundled server did not come up. Please reinstall, or report this error.`
    );
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && mainWindow) {
    createWindow();
  }
});

function cleanup() {
  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
    } catch {}
    serverProcess = null;
  }
}

app.on('before-quit', cleanup);
app.on('will-quit', cleanup);
app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
