const { app, BrowserWindow, globalShortcut, ipcMain, dialog, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

let mainWindow = null;
let tray = null;
let isVisible = true;
let settingsPath;
let progressPath;
let bookmarksPath;
let recentFilesPath;

let settings = {
  fontSize: 16,
  fontColor: '#333333',
  fontOpacity: 1.0,
  bgColor: '#ffffff',
  bgOpacity: 0.95,
  lineHeight: 1.8,
  hoverMode: false,
  alwaysOnTop: false,
  visibleLines: 0,
  autoHideOnLeave: false,
  hideBg: false,
  textOnly: false,
  toggleHotkey: 'CommandOrControl+Shift+H',
  bossHotkey: 'CommandOrControl+Shift+X',
  settingsHotkey: 'CommandOrControl+Shift+S',
  proLicenseKey: '',
  siteRules: {},
};

// ============ Pro License Validation ============
const LICENSE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LICENSE_SALT = 'HiderPro2026';

function computeLicenseChecksum(payload) {
  let hash = 5381;
  const str = LICENSE_SALT + payload;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xFFFFFFFF;
  }
  hash = hash >>> 0;
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += LICENSE_CHARS[hash % LICENSE_CHARS.length];
    hash = Math.floor(hash / LICENSE_CHARS.length);
  }
  return result;
}

function validateLicenseKey(key) {
  if (!key) return false;
  const clean = key.trim().toUpperCase().replace(/\s/g, '');
  const match = clean.match(/^HIDER-([A-Z2-9]{5})-([A-Z2-9]{5})-([A-Z2-9]{5})-([A-Z2-9]{5})$/);
  if (!match) return false;
  const payload = match[1] + match[2] + match[3];
  const checksum = computeLicenseChecksum(payload);
  return match[4] === checksum;
}

function isProActivated() {
  return validateLicenseKey(settings.proLicenseKey);
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      // Backward compat: convert old singleLineMode to visibleLines
      if (data.singleLineMode !== undefined) {
        if (data.singleLineMode && data.visibleLines === undefined) {
          data.visibleLines = 1;
        }
        delete data.singleLineMode;
      }
      settings = { ...settings, ...data };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

function loadProgress() {
  try {
    if (fs.existsSync(progressPath)) {
      return JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load progress:', e);
  }
  return {};
}

function saveProgress(data) {
  try {
    const existing = loadProgress();
    const merged = { ...existing, ...data };
    fs.writeFileSync(progressPath, JSON.stringify(merged, null, 2));
  } catch (e) {
    console.error('Failed to save progress:', e);
  }
}

function loadBookmarks() {
  try {
    if (fs.existsSync(bookmarksPath)) {
      return JSON.parse(fs.readFileSync(bookmarksPath, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load bookmarks:', e);
  }
  return [];
}

function saveBookmarks(data) {
  try {
    fs.writeFileSync(bookmarksPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save bookmarks:', e);
  }
}

function loadRecentFiles() {
  try {
    if (fs.existsSync(recentFilesPath)) {
      return JSON.parse(fs.readFileSync(recentFilesPath, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load recent files:', e);
  }
  return [];
}

function addRecentFile(filePath, fileName) {
  const list = loadRecentFiles();
  // Remove duplicate
  const filtered = list.filter(f => f.path !== filePath);
  // Prepend new entry
  filtered.unshift({ path: filePath, name: fileName, time: Date.now() });
  // Keep max 10
  const trimmed = filtered.slice(0, 10);
  try {
    fs.writeFileSync(recentFilesPath, JSON.stringify(trimmed, null, 2));
  } catch (e) {
    console.error('Failed to save recent files:', e);
  }
}

// EPUB parsing: extract text from EPUB zip
function parseEpub(filePath) {
  let zip, entries;
  try {
    zip = new AdmZip(filePath);
    entries = zip.getEntries();
  } catch (e) {
    throw new Error(`无法读取 EPUB 文件：${e.message}`);
  }

  // Find container.xml to get the root file
  const containerEntry = entries.find(e => e.entryName === 'META-INF/container.xml');
  let opfPath = '';
  if (containerEntry) {
    const containerXml = containerEntry.getData().toString('utf-8');
    const rootMatch = containerXml.match(/full-path=["']([^"']+)["']/);
    if (rootMatch) opfPath = rootMatch[1];
  }

  // Compute OPF directory for resolving relative hrefs
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
  const opfEntry = opfPath ? entries.find(e => e.entryName === opfPath) : null;
  let spineItems = [];

  if (opfEntry) {
    const opfXml = opfEntry.getData().toString('utf-8');

    // Parse manifest: extract each <item> tag individually (handles any attribute order)
    const manifest = {};
    const itemTags = opfXml.match(/<item\s[^>]*\/?>/gi) || [];
    for (const tag of itemTags) {
      const id = (tag.match(/\bid=["']([^"']+)["']/) || [])[1];
      const href = (tag.match(/\bhref=["']([^"']+)["']/) || [])[1];
      const type = (tag.match(/\bmedia-type=["']([^"']+)["']/) || [])[1];
      if (id && href && type) {
        manifest[id] = { href: decodeURIComponent(href), mediaType: type };
      }
    }

    // Parse spine: get reading order
    const spineRegex = /<itemref\s[^>]*idref=["']([^"']+)["']/gi;
    let match;
    while ((match = spineRegex.exec(opfXml)) !== null) {
      if (manifest[match[1]] && manifest[match[1]].mediaType.includes('html')) {
        spineItems.push(manifest[match[1]].href);
      }
    }
  }

  // Fallback: if spine is empty, find all HTML files sorted by name
  if (spineItems.length === 0) {
    spineItems = entries
      .filter(e => /\.(x?html?|htm)$/i.test(e.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName))
      .map(e => e.entryName);
  }

  // Extract text from each chapter
  const chapters = [];
  for (const href of spineItems) {
    const fullPath = resolveEpubPath(opfDir, href);
    const entry = entries.find(e =>
      e.entryName === fullPath ||
      e.entryName === href ||
      decodeURIComponent(e.entryName) === fullPath
    );
    if (!entry) continue;

    try {
      const html = entry.getData().toString('utf-8');
      const title = extractChapterTitle(html);
      const text = htmlToText(html);
      if (text.trim()) {
        chapters.push({ title, text: text.trim() });
      }
    } catch (e) {
      console.error(`Failed to parse chapter ${href}:`, e.message);
    }
  }

  if (chapters.length === 0) {
    throw new Error('未能从 EPUB 文件中提取到任何文本内容');
  }

  // Join chapters with separator (include title if not already in text)
  return chapters.map((ch, i) => {
    const firstLine = ch.text.split('\n')[0].trim();
    const titleAlreadyInText = ch.title && firstLine === ch.title;

    if (i === 0) {
      return titleAlreadyInText || !ch.title ? ch.text : `${ch.title}\n\n${ch.text}`;
    }
    const sep = '─'.repeat(40);
    if (titleAlreadyInText || !ch.title) {
      return `${sep}\n\n${ch.text}`;
    }
    return `${sep}\n\n${ch.title}\n\n${ch.text}`;
  }).join('\n\n');
}

// Resolve a relative path against a base directory (forward-slash paths for ZIP entries)
function resolveEpubPath(base, href) {
  if (!base || href.startsWith('/')) return href.replace(/^\//, '');
  const parts = (base + href).split('/');
  const resolved = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.' && part !== '') resolved.push(part);
  }
  return resolved.join('/');
}

// Extract chapter title from HTML heading tags
function extractChapterTitle(html) {
  for (const tag of ['h1', 'h2', 'h3']) {
    const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    if (match) {
      const title = match[1].replace(/<[^>]+>/g, '').trim();
      if (title && title.length < 100) return title;
    }
  }
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    if (title && title.length < 100) return title;
  }
  return '';
}

// HTML to text converter
function htmlToText(html) {
  return html
    // Remove scripts and styles
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Convert headings
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, '\n$2\n')
    // Convert list items
    .replace(/<li[^>]*>/gi, '\n  · ')
    // Convert common block elements to newlines
    .replace(/<\/?(p|div|br|blockquote|ul|ol|tr|section|article|header|footer)[^>]*>/gi, '\n')
    // Remove all other tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    // Clean up whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  let winWidth = 800, winHeight = 600, winX, winY;

  // Restore saved window bounds
  if (settings.windowBounds) {
    const b = settings.windowBounds;
    winWidth = b.width || 800;
    winHeight = b.height || 600;
    // Validate position is within any visible display
    const displays = screen.getAllDisplays();
    const onScreen = displays.some(d => {
      const wa = d.workArea;
      return b.x >= wa.x - 50 && b.x < wa.x + wa.width &&
             b.y >= wa.y - 50 && b.y < wa.y + wa.height;
    });
    if (onScreen) {
      winX = b.x;
      winY = b.y;
    }
  }

  if (winX === undefined) winX = Math.floor((workArea.width - winWidth) / 2);
  if (winY === undefined) winY = Math.floor((workArea.height - winHeight) / 2);

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: winX,
    y: winY,
    transparent: true,
    frame: false,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: false,
    hasShadow: false,
    resizable: true,
    minimizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  if (settings.alwaysOnTop) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Intercept new windows from webview: navigate in-place instead of opening new window
  mainWindow.webContents.on('did-attach-webview', (event, webContents) => {
    webContents.setWindowOpenHandler(({ url }) => {
      webContents.loadURL(url);
      return { action: 'deny' };
    });
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Auto-save window bounds on resize/move (debounced)
  let saveBoundsTimeout;
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isMinimized()) return;
    settings.windowBounds = mainWindow.getBounds();
    if (saveBoundsTimeout) clearTimeout(saveBoundsTimeout);
    saveBoundsTimeout = setTimeout(() => saveSettings(), 500);
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'img/icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(process.platform === 'darwin' ? icon.resize({ width: 16, height: 16 }) : icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示/隐藏', click: () => toggleVisibility() },
    { label: '打开文件', click: () => openFile() },
    { type: 'separator' },
    {
      label: '窗口置顶',
      type: 'checkbox',
      checked: settings.alwaysOnTop,
      click: (item) => {
        settings.alwaysOnTop = item.checked;
        mainWindow?.setAlwaysOnTop(item.checked, 'screen-saver');
        saveSettings();
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);

  tray.setToolTip('Hider - 摸鱼阅读器');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => toggleVisibility());
}

function restoreWindow() {
  if (!mainWindow) return;
  if (process.platform === 'darwin' && app.dock) {
    app.dock.show();
  }
  mainWindow.setSkipTaskbar(false);
  mainWindow.show();
  isVisible = true;
  if (!tray || tray.isDestroyed()) {
    createTray();
  }
}

function toggleVisibility() {
  if (!mainWindow) return;
  if (isVisible) {
    mainWindow.hide();
    isVisible = false;
  } else {
    restoreWindow();
  }
}

function bossKey() {
  if (!mainWindow) return;
  mainWindow.hide();
  isVisible = false;
  // Hide from Dock (macOS) / Taskbar (Windows)
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }
  mainWindow.setSkipTaskbar(true);
  // Hide tray / menu bar icon
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

async function openFile() {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: '支持的文件', extensions: ['txt', 'md', 'text', 'epub'] },
      { name: '文本文件', extensions: ['txt', 'md', 'text'] },
      { name: 'EPUB 电子书', extensions: ['epub'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    loadFileContent(result.filePaths[0]);
  }
}

function loadFileContent(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    let content;

    if (ext === '.epub') {
      content = parseEpub(filePath);
    } else {
      content = fs.readFileSync(filePath, 'utf-8');
    }

    const progress = loadProgress();
    const scrollPos = progress[filePath] || 0;
    const fileName = path.basename(filePath);
    addRecentFile(filePath, fileName);
    mainWindow.webContents.send('file-loaded', {
      path: filePath,
      name: fileName,
      content,
      scrollPosition: scrollPos,
    });
  } catch (e) {
    dialog.showErrorBox('错误', `文件读取失败：${e.message}`);
  }
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  try {
    globalShortcut.register(settings.toggleHotkey, () => toggleVisibility());
  } catch (e) {
    console.error('Failed to register toggle hotkey:', e);
  }
  try {
    globalShortcut.register(settings.bossHotkey, () => bossKey());
  } catch (e) {
    console.error('Failed to register boss hotkey:', e);
  }
  try {
    globalShortcut.register(settings.settingsHotkey, () => {
      if (mainWindow) {
        mainWindow.webContents.send('toggle-settings');
      }
    });
  } catch (e) {
    console.error('Failed to register settings hotkey:', e);
  }
}

// Single instance lock: clicking the icon again restores instead of launching a second instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (!isVisible) {
      restoreWindow();
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    settingsPath = path.join(app.getPath('userData'), 'settings.json');
    progressPath = path.join(app.getPath('userData'), 'progress.json');
    bookmarksPath = path.join(app.getPath('userData'), 'bookmarks.json');
    recentFilesPath = path.join(app.getPath('userData'), 'recent-files.json');
    loadSettings();
    createWindow();
    createTray();
    registerShortcuts();

    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('settings-loaded', {
        ...settings,
        proActivated: isProActivated(),
      });
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        if (!isVisible) restoreWindow();
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// IPC Handlers
ipcMain.handle('open-file', async () => {
  await openFile();
});

ipcMain.handle('get-settings', () => settings);

ipcMain.handle('save-settings', (event, newSettings) => {
  settings = { ...settings, ...newSettings };
  saveSettings();
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop, 'screen-saver');
  }
  registerShortcuts();
  return settings;
});

ipcMain.handle('save-progress', (event, data) => {
  saveProgress(data);
});

ipcMain.handle('toggle-visibility', () => toggleVisibility());

ipcMain.handle('minimize-window', () => mainWindow?.minimize());

ipcMain.handle('close-window', () => mainWindow?.close());

ipcMain.handle('set-window-size', (event, { width, height }) => {
  mainWindow?.setSize(width, height);
});

ipcMain.handle('get-window-bounds', () => {
  return mainWindow?.getBounds();
});

ipcMain.handle('set-ignore-mouse', (event, ignore) => {
  mainWindow?.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.handle('is-mouse-in-window', () => {
  if (!mainWindow) return false;
  const { x, y } = screen.getCursorScreenPoint();
  const bounds = mainWindow.getBounds();
  return x >= bounds.x && x <= bounds.x + bounds.width &&
         y >= bounds.y && y <= bounds.y + bounds.height;
});

ipcMain.handle('start-drag', () => {
  if (!mainWindow) return;
  const [winX, winY] = mainWindow.getPosition();
  const { x: mouseX, y: mouseY } = screen.getCursorScreenPoint();
  return { winX, winY, mouseX, mouseY };
});

ipcMain.handle('move-window', (event, { offsetX, offsetY }) => {
  if (!mainWindow) return;
  const { x: mouseX, y: mouseY } = screen.getCursorScreenPoint();
  mainWindow.setPosition(mouseX - offsetX, mouseY - offsetY);
});

ipcMain.handle('load-file-path', (event, filePath) => {
  loadFileContent(filePath);
});

ipcMain.handle('unregister-shortcuts', () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle('register-shortcuts', () => {
  registerShortcuts();
});

ipcMain.handle('load-bookmarks', () => {
  return loadBookmarks();
});

ipcMain.handle('save-bookmarks', (event, data) => {
  saveBookmarks(data);
});

ipcMain.handle('load-recent-files', () => {
  return loadRecentFiles();
});

ipcMain.handle('remove-recent-file', (event, filePath) => {
  const list = loadRecentFiles().filter(f => f.path !== filePath);
  try {
    fs.writeFileSync(recentFilesPath, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error('Failed to save recent files:', e);
  }
  return list;
});

ipcMain.handle('activate-pro', (event, key) => {
  if (validateLicenseKey(key)) {
    settings.proLicenseKey = key.trim().toUpperCase().replace(/\s/g, '');
    saveSettings();
    return { success: true };
  }
  return { success: false, error: '无效的许可证密钥' };
});

ipcMain.handle('deactivate-pro', () => {
  settings.proLicenseKey = '';
  saveSettings();
  return { success: true };
});

ipcMain.handle('get-pro-status', () => {
  return { proActivated: isProActivated() };
});

ipcMain.handle('open-help', () => {
  const helpWin = new BrowserWindow({
    width: 720,
    height: 640,
    title: 'Hider 使用帮助',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  helpWin.loadFile(path.join(__dirname, 'renderer', 'help.html'));
});
